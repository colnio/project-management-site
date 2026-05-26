// Package jobs manages River (Postgres-backed) job queue migrations and
// provides shared helpers for registering workers and building clients.
//
// Call Migrate once after goose migrations to create River's own schema tables
// (river_job, river_queue, river_leader, …). The call is idempotent.
package jobs

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river/rivermigrate"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

// Migrate applies River's schema migrations to the database. It is idempotent
// and should be called after the application's goose migrations on every boot.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return fmt.Errorf("jobs: build river migrator: %w", err)
	}
	if _, err := migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		return fmt.Errorf("jobs: river migrate up: %w", err)
	}
	return nil
}
