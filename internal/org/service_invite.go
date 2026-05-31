package org

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

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

	link := fmt.Sprintf("%s/invite/accept?token=%s", s.cfg.WebOrigin, rawToken)
	if s.notify != nil {
		if sendErr := s.notify.EnqueueWorkspaceInvite(ctx, inv.ID, email, link); sendErr != nil {
			s.log.Warn("org: failed to enqueue invite email", "error", sendErr, "invite_id", inv.ID)
		}
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

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("org: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx,
		`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		inv.workspaceID, u.ID, inv.role,
	)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("org: add membership on accept: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE invites SET accepted_at=now(), accepted_as_user=$1 WHERE id=$2 AND accepted_at IS NULL`,
		u.ID, inv.id,
	)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("org: mark invite accepted: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("org: commit accept invite: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        u.ID,
		Action:       "invite.accept",
		ResourceType: "invite",
		ResourceID:   inv.id.String(),
	})

	return u.ID, inv.workspaceID, nil
}
