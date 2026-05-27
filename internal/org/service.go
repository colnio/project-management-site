// Package org implements the Org module (A3): workspaces, memberships,
// project collaborations, admin overrides, and workspace invites.
package org

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/platform"
)

// Users is the interface the org service uses to resolve/create users.
// It mirrors the methods that auth.Service exposes so the real service can be
// passed directly, but tests can supply a simple fake.
type Users interface {
	GetUserByEmail(ctx context.Context, email string) (*auth.User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (*auth.User, error)
	CreateUser(ctx context.Context, email, displayName string) (*auth.User, error)
	SetPassword(ctx context.Context, userID uuid.UUID, password string) error
}

// ─── Domain structs ──────────────────────────────────────────────────────────

// Workspace is the exported domain struct for a workspace.
type Workspace struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	CreatedBy uuid.UUID `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Membership represents a user's membership in a workspace.
type Membership struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	UserID      uuid.UUID `json:"user_id"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"created_at"`
}

// Collaborator represents a per-project collaborator entry.
type Collaborator struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"project_id"`
	UserID    uuid.UUID `json:"user_id"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// Invite represents a pending or accepted workspace invitation.
type Invite struct {
	ID             uuid.UUID  `json:"id"`
	Email          string     `json:"email"`
	WorkspaceID    uuid.UUID  `json:"workspace_id"`
	Role           string     `json:"role"`
	InvitedBy      uuid.UUID  `json:"invited_by"`
	ExpiresAt      time.Time  `json:"expires_at"`
	AcceptedAt     *time.Time `json:"accepted_at,omitempty"`
	AcceptedAsUser *uuid.UUID `json:"accepted_as_user,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// ─── Service ─────────────────────────────────────────────────────────────────

// Service is the org module's domain service.
type Service struct {
	pool  *pgxpool.Pool
	cfg   *config.Config
	rec   audit.Recorder
	users Users
	log   *slog.Logger
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool, cfg *config.Config, rec audit.Recorder, users Users, log *slog.Logger) *Service {
	return &Service{
		pool:  pool,
		cfg:   cfg,
		rec:   rec,
		users: users,
		log:   log,
	}
}

// ─── Workspace CRUD ──────────────────────────────────────────────────────────

// CreateWorkspace creates a new workspace and adds the creator as owner.
func (s *Service) CreateWorkspace(ctx context.Context, name string, creatorID uuid.UUID) (*Workspace, error) {
	slug, err := s.uniqueSlug(ctx, slugify(name))
	if err != nil {
		return nil, fmt.Errorf("org: generate slug: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("org: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var ws Workspace
	err = tx.QueryRow(ctx,
		`INSERT INTO workspaces (name, slug, created_by)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, slug, created_by, created_at, updated_at`,
		name, slug, creatorID,
	).Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.CreatedBy, &ws.CreatedAt, &ws.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("org: create workspace: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
		ws.ID, creatorID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: add owner membership: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("org: commit workspace creation: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        creatorID,
		Action:       "workspace.create",
		ResourceType: "workspace",
		ResourceID:   ws.ID.String(),
	})

	return &ws, nil
}

// GetWorkspace returns a workspace by ID, or platform.NotFound if absent.
func (s *Service) GetWorkspace(ctx context.Context, id uuid.UUID) (*Workspace, error) {
	var ws Workspace
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, slug, created_by, created_at, updated_at FROM workspaces WHERE id=$1`,
		id,
	).Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.CreatedBy, &ws.CreatedAt, &ws.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("workspace.not_found", "workspace not found")
	}
	if err != nil {
		return nil, fmt.Errorf("org: get workspace: %w", err)
	}
	return &ws, nil
}

// ListWorkspacesForUser returns all workspaces the user is a member of.
func (s *Service) ListWorkspacesForUser(ctx context.Context, userID uuid.UUID) ([]*Workspace, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT w.id, w.name, w.slug, w.created_by, w.created_at, w.updated_at
		 FROM workspaces w
		 JOIN workspace_memberships m ON m.workspace_id = w.id
		 WHERE m.user_id = $1
		 ORDER BY w.created_at`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list workspaces: %w", err)
	}
	defer rows.Close()

	var result []*Workspace
	for rows.Next() {
		var ws Workspace
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.CreatedBy, &ws.CreatedAt, &ws.UpdatedAt); err != nil {
			return nil, fmt.Errorf("org: scan workspace: %w", err)
		}
		result = append(result, &ws)
	}
	return result, rows.Err()
}

// ─── Membership management ────────────────────────────────────────────────────

// WorkspaceRole returns the user's role in the workspace, or ("", false, nil) if not a member.
func (s *Service) WorkspaceRole(ctx context.Context, workspaceID, userID uuid.UUID) (string, bool, error) {
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, userID,
	).Scan(&role)
	if err == pgx.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("org: workspace role: %w", err)
	}
	return role, true, nil
}

// AddMember upserts a workspace membership. The caller must have already verified authorization.
func (s *Service) AddMember(ctx context.Context, workspaceID, userID uuid.UUID, role string, actorID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		workspaceID, userID, role,
	)
	if err != nil {
		return fmt.Errorf("org: add member: %w", err)
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "workspace.member_add",
		ResourceType: "workspace_membership",
		ResourceID:   workspaceID.String(),
	})
	return nil
}

// RemoveMember removes a workspace membership. Returns an error if removing would leave no owners.
func (s *Service) RemoveMember(ctx context.Context, workspaceID, targetUserID uuid.UUID, actorID uuid.UUID) error {
	// Check if the target is an owner and if they'd be the last.
	var targetRole string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, targetUserID,
	).Scan(&targetRole)
	if err == pgx.ErrNoRows {
		return platform.NotFound("membership.not_found", "membership not found")
	}
	if err != nil {
		return fmt.Errorf("org: check target role: %w", err)
	}

	if targetRole == "owner" {
		var ownerCount int
		err = s.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM workspace_memberships WHERE workspace_id=$1 AND role='owner'`,
			workspaceID,
		).Scan(&ownerCount)
		if err != nil {
			return fmt.Errorf("org: count owners: %w", err)
		}
		if ownerCount <= 1 {
			return platform.BadRequest("membership.last_owner", "cannot remove the last workspace owner")
		}
	}

	_, err = s.pool.Exec(ctx,
		`DELETE FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, targetUserID,
	)
	if err != nil {
		return fmt.Errorf("org: remove member: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "workspace.member_remove",
		ResourceType: "workspace_membership",
		ResourceID:   workspaceID.String(),
	})
	return nil
}

// ListMembers returns all memberships for a workspace.
func (s *Service) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]Membership, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, user_id, role, created_at
		 FROM workspace_memberships WHERE workspace_id=$1 ORDER BY created_at`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list members: %w", err)
	}
	defer rows.Close()

	var result []Membership
	for rows.Next() {
		var m Membership
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("org: scan membership: %w", err)
		}
		result = append(result, m)
	}
	return result, rows.Err()
}

// MemberView is an enriched membership that includes user profile fields.
type MemberView struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	UserID      uuid.UUID `json:"user_id"`
	Role        string    `json:"role"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	UserCreatedAt time.Time `json:"user_created_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// ListMembersEnriched returns workspace memberships joined with user profile
// data (email, display_name). It uses users.display_name directly; that column
// exists in the users table as confirmed by auth/user.go.
func (s *Service) ListMembersEnriched(ctx context.Context, workspaceID uuid.UUID) ([]MemberView, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT m.id, m.workspace_id, m.user_id, m.role,
		        u.email, u.display_name, u.created_at AS user_created_at,
		        m.created_at
		 FROM workspace_memberships m
		 JOIN users u ON u.id = m.user_id
		 WHERE m.workspace_id = $1
		 ORDER BY m.created_at`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list members enriched: %w", err)
	}
	defer rows.Close()

	var result []MemberView
	for rows.Next() {
		var mv MemberView
		if err := rows.Scan(
			&mv.ID, &mv.WorkspaceID, &mv.UserID, &mv.Role,
			&mv.Email, &mv.DisplayName, &mv.UserCreatedAt,
			&mv.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("org: scan member view: %w", err)
		}
		result = append(result, mv)
	}
	return result, rows.Err()
}

// ─── Project collaborator Go API ─────────────────────────────────────────────

// AddCollaborator upserts a project collaborator entry.
func (s *Service) AddCollaborator(ctx context.Context, projectID, userID uuid.UUID, role Role) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO project_collaborations (project_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		projectID, userID, string(role),
	)
	if err != nil {
		return fmt.Errorf("org: add collaborator: %w", err)
	}
	return nil
}

// RemoveCollaborator deletes a project collaborator entry.
func (s *Service) RemoveCollaborator(ctx context.Context, projectID, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM project_collaborations WHERE project_id=$1 AND user_id=$2`,
		projectID, userID,
	)
	if err != nil {
		return fmt.Errorf("org: remove collaborator: %w", err)
	}
	return nil
}

// ListCollaborators returns all collaborators for a project.
func (s *Service) ListCollaborators(ctx context.Context, projectID uuid.UUID) ([]Collaborator, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, user_id, role, created_at
		 FROM project_collaborations WHERE project_id=$1 ORDER BY created_at`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list collaborators: %w", err)
	}
	defer rows.Close()

	var result []Collaborator
	for rows.Next() {
		var c Collaborator
		var roleStr string
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.UserID, &roleStr, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("org: scan collaborator: %w", err)
		}
		c.Role = Role(roleStr)
		result = append(result, c)
	}
	return result, rows.Err()
}

// CollaboratorRole returns the role and a found boolean for a specific collaborator.
func (s *Service) CollaboratorRole(ctx context.Context, projectID, userID uuid.UUID) (Role, bool, error) {
	var roleStr string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM project_collaborations WHERE project_id=$1 AND user_id=$2`,
		projectID, userID,
	).Scan(&roleStr)
	if err == pgx.ErrNoRows {
		return RoleNone, false, nil
	}
	if err != nil {
		return RoleNone, false, fmt.Errorf("org: collaborator role: %w", err)
	}
	return Role(roleStr), true, nil
}

// ─── Invites ─────────────────────────────────────────────────────────────────

// CreateInvite creates a workspace invite, sends an email, and returns the invite.
func (s *Service) CreateInvite(ctx context.Context, workspaceID uuid.UUID, email, role string, invitedBy uuid.UUID) (*Invite, string, error) {
	rawToken, err := generateToken(32)
	if err != nil {
		return nil, "", fmt.Errorf("org: generate invite token: %w", err)
	}
	tokenHash := hashToken(rawToken)
	expiresAt := time.Now().UTC().Add(7 * 24 * time.Hour)

	var inv Invite
	err = s.pool.QueryRow(ctx,
		`INSERT INTO invites (email, workspace_id, role, invited_by, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, email, workspace_id, role, invited_by, expires_at, accepted_at, accepted_as_user, created_at`,
		email, workspaceID, role, invitedBy, tokenHash, expiresAt,
	).Scan(&inv.ID, &inv.Email, &inv.WorkspaceID, &inv.Role, &inv.InvitedBy,
		&inv.ExpiresAt, &inv.AcceptedAt, &inv.AcceptedAsUser, &inv.CreatedAt)
	if err != nil {
		return nil, "", fmt.Errorf("org: create invite: %w", err)
	}

	// Send email — best effort.
	link := fmt.Sprintf("%s/invite/accept?token=%s", s.cfg.WebOrigin, rawToken)
	if sendErr := s.sendInviteEmail(email, link); sendErr != nil {
		s.log.Warn("org: failed to send invite email", "error", sendErr, "invite_id", inv.ID)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        invitedBy,
		Action:       "invite.create",
		ResourceType: "invite",
		ResourceID:   inv.ID.String(),
	})

	return &inv, rawToken, nil
}

// AcceptInvite validates a token and completes the invite acceptance.
func (s *Service) AcceptInvite(ctx context.Context, rawToken, password, displayName string) (userID, workspaceID uuid.UUID, err error) {
	tokenHash := hashToken(rawToken)

	var inv struct {
		id          uuid.UUID
		email       string
		workspaceID uuid.UUID
		role        string
		acceptedAt  *time.Time
		expiresAt   time.Time
	}

	err = s.pool.QueryRow(ctx,
		`SELECT id, email, workspace_id, role, accepted_at, expires_at
		 FROM invites WHERE token_hash=$1`,
		tokenHash,
	).Scan(&inv.id, &inv.email, &inv.workspaceID, &inv.role, &inv.acceptedAt, &inv.expiresAt)
	if err == pgx.ErrNoRows {
		return uuid.Nil, uuid.Nil, platform.NotFound("invite.invalid", "invite not found or invalid")
	}
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("org: find invite: %w", err)
	}

	if inv.acceptedAt != nil {
		return uuid.Nil, uuid.Nil, platform.BadRequest("invite.already_accepted", "invite has already been accepted")
	}
	if time.Now().After(inv.expiresAt) {
		return uuid.Nil, uuid.Nil, platform.BadRequest("invite.expired", "invite has expired")
	}

	// Find or create user.
	u, err := s.users.GetUserByEmail(ctx, inv.email)
	if err != nil {
		// User doesn't exist — create them.
		name := displayName
		if name == "" {
			name = inv.email
		}
		u, err = s.users.CreateUser(ctx, inv.email, name)
		if err != nil {
			return uuid.Nil, uuid.Nil, fmt.Errorf("org: create user for invite: %w", err)
		}
		if password != "" {
			if err = s.users.SetPassword(ctx, u.ID, password); err != nil {
				return uuid.Nil, uuid.Nil, fmt.Errorf("org: set password: %w", err)
			}
		}
	}

	// Add workspace membership (upsert).
	_, err = s.pool.Exec(ctx,
		`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		inv.workspaceID, u.ID, inv.role,
	)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("org: add membership on accept: %w", err)
	}

	// Mark invite accepted.
	_, err = s.pool.Exec(ctx,
		`UPDATE invites SET accepted_at=now(), accepted_as_user=$1 WHERE id=$2`,
		u.ID, inv.id,
	)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("org: mark invite accepted: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        u.ID,
		Action:       "invite.accept",
		ResourceType: "invite",
		ResourceID:   inv.id.String(),
	})

	return u.ID, inv.workspaceID, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9]+`)

// slugify converts a name into a lowercase URL-safe slug.
func slugify(name string) string {
	s := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToLower(r)
		}
		return '-'
	}, name)
	s = nonAlphaNum.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "workspace"
	}
	return s
}

// uniqueSlug returns a slug that does not collide in the workspaces table.
func (s *Service) uniqueSlug(ctx context.Context, base string) (string, error) {
	candidate := base
	for i := 0; i < 10; i++ {
		var exists bool
		err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM workspaces WHERE slug=$1)`, candidate,
		).Scan(&exists)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
		// Append a short random suffix (6 bytes -> 8 base64 chars; take 6).
		suffix, err := generateToken(6)
		if err != nil {
			return "", err
		}
		candidate = base + "-" + suffix[:6]
	}
	return "", fmt.Errorf("could not generate unique slug after 10 attempts")
}

// generateToken returns a URL-safe base64 random string of n bytes.
func generateToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// hashToken returns the hex-encoded sha256 of a raw token.
func hashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}
