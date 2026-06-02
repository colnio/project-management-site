// Package auth implements the Identity/Auth module (A1): user management,
// local-password login, JWT access tokens, refresh sessions,
// personal access tokens (PATs), and internal LLM tokens.
package auth

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/config"
)

// Service is the auth module's domain service. Construct with NewService.
type Service struct {
	pool *pgxpool.Pool
	cfg  *config.Config
	rec  audit.Recorder
	log  *slog.Logger
}

// NewService constructs a Service.
func NewService(_ context.Context, pool *pgxpool.Pool, cfg *config.Config, rec audit.Recorder, log *slog.Logger) (*Service, error) {
	svc := &Service{
		pool: pool,
		cfg:  cfg,
		rec:  rec,
		log:  log,
	}
	return svc, nil
}
