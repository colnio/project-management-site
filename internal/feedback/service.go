// Package feedback stores user-submitted feedback and exposes it to admins.
package feedback

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
)

// Feedback is a single submitted feedback entry.
type Feedback struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	Category  string
	Message   string
	Status    string
	CreatedAt time.Time
}

// Row is a feedback entry enriched with submitter display info for admin views.
type Row struct {
	Feedback
	SubmitterName  string
	SubmitterEmail string
	AcknowledgedAt *time.Time
}

// Service stores and retrieves feedback.
type Service struct {
	pool *pgxpool.Pool
	rec  audit.Recorder
	log  *slog.Logger
}

// NewService constructs a feedback Service.
func NewService(pool *pgxpool.Pool, rec audit.Recorder, log *slog.Logger) *Service {
	return &Service{pool: pool, rec: rec, log: log}
}

// Create inserts a new feedback entry submitted by userID.
func (s *Service) Create(ctx context.Context, userID uuid.UUID, category, message string) (*Feedback, error) {
	f := &Feedback{}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO feedback (user_id, category, message)
		 VALUES ($1, $2, $3)
		 RETURNING id, user_id, category, message, status, created_at`,
		userID, category, message,
	).Scan(&f.ID, &f.UserID, &f.Category, &f.Message, &f.Status, &f.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("feedback: create: %w", err)
	}
	return f, nil
}

// List returns feedback newest-first. When includeAcknowledged is false, only
// 'new' (un-acknowledged) entries are returned; acknowledged ones stay in the
// DB but are hidden from the default admin view.
func (s *Service) List(ctx context.Context, includeAcknowledged bool) ([]Row, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT f.id, f.user_id, f.category, f.message, f.status, f.created_at,
		        f.acknowledged_at,
		        COALESCE(u.display_name, ''), COALESCE(u.email, '')
		 FROM feedback f
		 LEFT JOIN users u ON u.id = f.user_id
		 WHERE ($1 OR f.status = 'new')
		 ORDER BY f.created_at DESC`,
		includeAcknowledged,
	)
	if err != nil {
		return nil, fmt.Errorf("feedback: list: %w", err)
	}
	defer rows.Close()

	out := []Row{}
	for rows.Next() {
		var r Row
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.Category, &r.Message, &r.Status, &r.CreatedAt,
			&r.AcknowledgedAt, &r.SubmitterName, &r.SubmitterEmail,
		); err != nil {
			return nil, fmt.Errorf("feedback: list scan: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Acknowledge marks a feedback entry as acknowledged by adminID. Acknowledged
// entries are kept in the DB but hidden from the default admin view.
func (s *Service) Acknowledge(ctx context.Context, adminID, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE feedback
		 SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = now()
		 WHERE id = $2`,
		adminID, id,
	)
	if err != nil {
		return fmt.Errorf("feedback: acknowledge: %w", err)
	}
	return nil
}
