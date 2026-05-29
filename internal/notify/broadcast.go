package notify

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// BroadcastInput describes an admin announcement.
type BroadcastInput struct {
	Subject     string
	Body        string
	Audience    string // all | workspace | users
	WorkspaceID *uuid.UUID
	UserIDs     []uuid.UUID
}

// CreateBroadcast sends a mandatory email to each resolved recipient.
func (s *Service) CreateBroadcast(ctx context.Context, actor uuid.UUID, in BroadcastInput) (uuid.UUID, int, error) {
	if in.Subject == "" || in.Body == "" {
		return uuid.Nil, 0, platform.BadRequest("notify.broadcast_invalid", "subject and body are required")
	}

	recipients, err := s.resolveBroadcastRecipients(ctx, in)
	if err != nil {
		return uuid.Nil, 0, err
	}
	if len(recipients) == 0 {
		return uuid.Nil, 0, platform.BadRequest("notify.no_recipients", "no recipients matched the audience")
	}

	var broadcastID uuid.UUID
	err = s.pool.QueryRow(ctx,
		`INSERT INTO admin_broadcasts (created_by, subject, body, audience, workspace_id)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		actor, in.Subject, in.Body, in.Audience, in.WorkspaceID,
	).Scan(&broadcastID)
	if err != nil {
		return uuid.Nil, 0, fmt.Errorf("notify: insert broadcast: %w", err)
	}

	sent := 0
	for _, r := range recipients {
		uid := r.ID
		idem := fmt.Sprintf("broadcast:%s:%s", broadcastID, r.ID)
		if err := s.Enqueue(ctx, EnqueueParams{
			UserID:         &uid,
			ToEmail:        r.Email,
			Category:       CategoryAdminBroadcast,
			TemplateKey:    TemplateAdminBroadcast,
			IdempotencyKey: idem,
			Payload: map[string]any{
				"Subject":    in.Subject,
				"Body":       in.Body,
				"ActionPath": "/",
			},
		}); err != nil {
			s.log.Warn("notify: broadcast enqueue failed", "user_id", r.ID, "err", err)
			continue
		}
		sent++
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actor,
		Action:       "admin.broadcast.create",
		ResourceType: "admin_broadcast",
		ResourceID:   broadcastID.String(),
	})

	return broadcastID, sent, nil
}

type recipient struct {
	ID    uuid.UUID
	Email string
}

func (s *Service) resolveBroadcastRecipients(ctx context.Context, in BroadcastInput) ([]recipient, error) {
	switch in.Audience {
	case "all":
		rows, err := s.pool.Query(ctx,
			`SELECT id, email FROM users WHERE status = 'approved'`,
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanRecipients(rows)
	case "workspace":
		if in.WorkspaceID == nil {
			return nil, platform.BadRequest("notify.workspace_required", "workspace_id is required for workspace audience")
		}
		rows, err := s.pool.Query(ctx,
			`SELECT u.id, u.email FROM users u
			 JOIN workspace_memberships m ON m.user_id = u.id
			 WHERE m.workspace_id = $1 AND u.status = 'approved'`,
			*in.WorkspaceID,
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanRecipients(rows)
	case "users":
		if len(in.UserIDs) == 0 {
			return nil, platform.BadRequest("notify.users_required", "user_ids is required for users audience")
		}
		rows, err := s.pool.Query(ctx,
			`SELECT id, email FROM users WHERE id = ANY($1) AND status = 'approved'`,
			in.UserIDs,
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanRecipients(rows)
	default:
		return nil, platform.BadRequest("notify.invalid_audience", "audience must be all, workspace, or users")
	}
}

type rowScanner interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
}

func scanRecipients(rows rowScanner) ([]recipient, error) {
	var out []recipient
	for rows.Next() {
		var r recipient
		if err := rows.Scan(&r.ID, &r.Email); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
