// Command seed loads demo data into the local database. It is safe to run
// repeatedly (each seeder is idempotent). Modules contribute seeders here as
// tracks land; for now it seeds the dev login user.
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/joho/godotenv"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/db"
)

func main() {
	if err := run(); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
	slog.Info("seed complete")
}

func run() error {
	_ = godotenv.Load()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool, cfg.DatabaseURL); err != nil {
		return err
	}

	authSvc, err := auth.NewService(ctx, pool, cfg, audit.NewRecorder(pool, logger), logger)
	if err != nil {
		return err
	}
	if err := authSvc.SeedDevUser(ctx); err != nil {
		return err
	}
	logger.Info("seeded dev user", "email", "dev@halide-lab.org", "password", "devpassword")
	return nil
}
