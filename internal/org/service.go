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
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
)

// Users is the interface the org service uses to resolve/create users.
// It mirrors the methods that auth.Service exposes so the real service can be
// passed directly, but tests can supply a simple fake.
type Users interface {
	GetUserByEmail(ctx context.Context, email string) (*auth.User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (*auth.User, error)
	GetUsersByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]*auth.User, error)
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

// MemberView is an enriched membership that includes user profile fields.
type MemberView struct {
	ID            uuid.UUID `json:"id"`
	WorkspaceID   uuid.UUID `json:"workspace_id"`
	UserID        uuid.UUID `json:"user_id"`
	Role          string    `json:"role"`
	Email         string    `json:"email"`
	DisplayName   string    `json:"display_name"`
	UserCreatedAt time.Time `json:"user_created_at"`
	CreatedAt     time.Time `json:"created_at"`
}

// CollaboratorView is a collaborator joined with user profile data.
type CollaboratorView struct {
	ID          uuid.UUID `json:"id"`
	ProjectID   uuid.UUID `json:"project_id"`
	UserID      uuid.UUID `json:"user_id"`
	Role        string    `json:"role"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	CreatedAt   time.Time `json:"created_at"`
}

// ─── Service ─────────────────────────────────────────────────────────────────

// InviteNotifier sends workspace invite emails (notify.Service).
type InviteNotifier interface {
	EnqueueWorkspaceInvite(ctx context.Context, inviteID uuid.UUID, toEmail, inviteLink string) error
}

// Service is the org module's domain service.
type Service struct {
	pool   *pgxpool.Pool
	cfg    *config.Config
	rec    audit.Recorder
	users  Users
	log    *slog.Logger
	notify InviteNotifier
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

// SetInviteNotifier wires the notify module for invite emails.
func (s *Service) SetInviteNotifier(n InviteNotifier) {
	s.notify = n
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
