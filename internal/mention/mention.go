// Package mention implements the @-mention module: creating mention records
// when users are referenced in tasks or pages, and delivering email
// notifications via the notify module.
//
// Mentions are deduplicated: a second Create call for the same
// (mentioned_user_id, source_type, source_id) tuple is silently ignored and
// no duplicate notification is sent.
//
// The notify dependency is injected via SetNotifier so that the task module
// (and future page module) can call Create without a circular dependency.
package mention

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MentionNotifier sends email notifications when a user is @-mentioned.
// Satisfied by *notify.Service.
type MentionNotifier interface {
	EnqueueMention(ctx context.Context, mentionedUserID uuid.UUID, toEmail, actorName, snippet, actionPath, idempotencyKey string) error
}

// Mention is the core domain struct for a mention record.
type Mention struct {
	ID              uuid.UUID  `json:"id"`
	MentionedUserID uuid.UUID  `json:"mentioned_user_id"`
	ActorID         uuid.UUID  `json:"actor_id"`
	SourceType      string     `json:"source_type"`
	SourceID        uuid.UUID  `json:"source_id"`
	ProjectID       *uuid.UUID `json:"project_id,omitempty"`
	WorkspaceID     *uuid.UUID `json:"workspace_id,omitempty"`
	Link            string     `json:"link"`
	Snippet         string     `json:"snippet"`
	CreatedAt       time.Time  `json:"created_at"`
	ReadAt          *time.Time `json:"read_at,omitempty"`
}

// Service is the mention module's domain service.
type Service struct {
	pool   *pgxpool.Pool
	log    *slog.Logger
	notify MentionNotifier
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool, log *slog.Logger) *Service {
	return &Service{
		pool: pool,
		log:  log,
	}
}

// SetNotifier wires the notify module for mention email delivery.
func (s *Service) SetNotifier(n MentionNotifier) {
	s.notify = n
}

// Create records an @-mention of mentionedUserID by actorID within the given
// source (task or page). If actorID == mentionedUserID the call is a no-op.
// Duplicate mentions (same mentionedUserID+sourceType+sourceID) are silently
// ignored (no re-notification). On a fresh insert the mention email is
// dispatched best-effort; a notify failure is logged but never returned.
func (s *Service) Create(
	ctx context.Context,
	actorID, mentionedUserID uuid.UUID,
	sourceType string,
	sourceID uuid.UUID,
	projectID, workspaceID *uuid.UUID,
	link, snippet string,
) error {
	// Don't notify yourself.
	if actorID == mentionedUserID {
		return nil
	}

	// Insert; ON CONFLICT DO NOTHING + RETURNING id: if the row already
	// existed pgx.ErrNoRows is returned from QueryRow.Scan.
	var mentionID uuid.UUID
	err := s.pool.QueryRow(ctx,
		`INSERT INTO mentions
		   (mentioned_user_id, actor_id, source_type, source_id, project_id, workspace_id, link, snippet)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (mentioned_user_id, source_type, source_id) DO NOTHING
		 RETURNING id`,
		mentionedUserID, actorID, sourceType, sourceID,
		projectID, workspaceID,
		link, snippet,
	).Scan(&mentionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			// Conflict — already mentioned; no re-notify.
			return nil
		}
		return fmt.Errorf("mention: insert: %w", err)
	}

	// Fresh insert — resolve email addresses and dispatch notification.
	if s.notify != nil {
		var toEmail string
		var actorName string

		if qerr := s.pool.QueryRow(ctx,
			`SELECT email FROM users WHERE id = $1`, mentionedUserID,
		).Scan(&toEmail); qerr != nil {
			s.log.Warn("mention: resolve recipient email", "mentioned_user_id", mentionedUserID, "err", qerr)
			return nil // best-effort; don't fail the request
		}

		if qerr := s.pool.QueryRow(ctx,
			`SELECT COALESCE(NULLIF(display_name,''), email) FROM users WHERE id = $1`, actorID,
		).Scan(&actorName); qerr != nil {
			s.log.Warn("mention: resolve actor name", "actor_id", actorID, "err", qerr)
			actorName = "Someone"
		}

		idempotencyKey := fmt.Sprintf("mention:%s:%s:%s", sourceType, sourceID, mentionedUserID)
		if nerr := s.notify.EnqueueMention(ctx, mentionedUserID, toEmail, actorName, snippet, link, idempotencyKey); nerr != nil {
			s.log.Warn("mention: enqueue notification failed", "mention_id", mentionID, "err", nerr)
			// Never fail the caller over a notification error.
		}
	}

	return nil
}

// ListForUser returns recent mentions for a user, optionally scoped to a
// workspace, newest-first up to limit rows.
func (s *Service) ListForUser(ctx context.Context, userID uuid.UUID, workspaceID *uuid.UUID, limit int) ([]*Mention, error) {
	if limit <= 0 {
		limit = 25
	}

	var rows pgx.Rows
	var err error

	if workspaceID != nil {
		rows, err = s.pool.Query(ctx,
			`SELECT id, mentioned_user_id, actor_id, source_type, source_id,
			        project_id, workspace_id, link, snippet, created_at, read_at
			 FROM mentions
			 WHERE mentioned_user_id = $1
			   AND workspace_id = $2
			 ORDER BY created_at DESC
			 LIMIT $3`,
			userID, *workspaceID, limit,
		)
	} else {
		rows, err = s.pool.Query(ctx,
			`SELECT id, mentioned_user_id, actor_id, source_type, source_id,
			        project_id, workspace_id, link, snippet, created_at, read_at
			 FROM mentions
			 WHERE mentioned_user_id = $1
			 ORDER BY created_at DESC
			 LIMIT $2`,
			userID, limit,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("mention: list for user: query: %w", err)
	}
	defer rows.Close()

	var out []*Mention
	for rows.Next() {
		var m Mention
		if serr := rows.Scan(
			&m.ID, &m.MentionedUserID, &m.ActorID,
			&m.SourceType, &m.SourceID,
			&m.ProjectID, &m.WorkspaceID,
			&m.Link, &m.Snippet,
			&m.CreatedAt, &m.ReadAt,
		); serr != nil {
			return nil, fmt.Errorf("mention: list for user: scan: %w", serr)
		}
		out = append(out, &m)
	}
	if rerr := rows.Err(); rerr != nil {
		return nil, fmt.Errorf("mention: list for user: rows: %w", rerr)
	}
	if out == nil {
		out = []*Mention{}
	}
	return out, nil
}
