// Package appearance manages per-user appearance preferences stored in Postgres.
package appearance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
)

// Service stores and retrieves per-user appearance preferences.
type Service struct {
	pool *pgxpool.Pool
	rec  audit.Recorder
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool, rec audit.Recorder) *Service {
	return &Service{pool: pool, rec: rec}
}

// Get returns the stored prefs JSON for the given user.
// Returns '{}' when no row exists yet.
func (s *Service) Get(ctx context.Context, userID uuid.UUID) (json.RawMessage, error) {
	var raw json.RawMessage
	err := s.pool.QueryRow(ctx,
		`SELECT prefs FROM user_appearance WHERE user_id = $1`,
		userID,
	).Scan(&raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return json.RawMessage(`{}`), nil
		}
		return nil, fmt.Errorf("appearance: get: %w", err)
	}
	return raw, nil
}

// Put upserts the prefs JSON for the given user.
func (s *Service) Put(ctx context.Context, userID uuid.UUID, prefs json.RawMessage) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO user_appearance (user_id, prefs, updated_at)
		 VALUES ($1, $2, now())
		 ON CONFLICT (user_id)
		 DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
		userID, prefs,
	)
	if err != nil {
		return fmt.Errorf("appearance: put: %w", err)
	}
	return nil
}
