// Command api is the single binary entrypoint: it loads configuration, opens
// the Postgres pool, runs goose migrations behind an advisory lock, wires the
// chi+huma server and the (eventual) River worker, and starts listening.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/colnio/project-management-site/internal/artifact"
	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/db"
	"github.com/colnio/project-management-site/internal/experiment"
	"github.com/colnio/project-management-site/internal/iteration"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/page"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/sample"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	_ = godotenv.Load() // .env is optional; real env wins.

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	logger.Info("running migrations")
	if err := db.Migrate(ctx, pool, cfg.DatabaseURL); err != nil {
		return err
	}

	auditRec := audit.NewRecorder(pool, logger)
	authSvc, err := auth.NewService(ctx, pool, cfg, auditRec, logger)
	if err != nil {
		return err
	}

	srv := platform.New(&platform.ServerDeps{
		Logger:      logger,
		WebOrigin:   cfg.WebOrigin,
		Verifier:    authSvc,
		Idempotency: platform.NewIdempotencyStore(pool),
		PerMinute:   600,
	})
	srv.MountLLMSTxt(llmsTxtStub(cfg.WebOrigin))

	// Domain module routes. More are registered here as tracks land, e.g.:
	//   project.Register(srv.API, projectSvc)
	orgSvc := org.NewService(pool, cfg, auditRec, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, auditRec, logger)
	iterationSvc := iteration.NewService(pool, projectSvc, auditRec, logger)
	sampleSvc := sample.NewService(pool, projectSvc, auditRec, logger)
	experimentSvc := experiment.NewService(pool, projectSvc, auditRec, logger)
	pageSvc := page.NewService(pool, projectSvc, auditRec, logger)
	artifactSvc, err := artifact.NewService(pool, projectSvc, cfg, auditRec, logger)
	if err != nil {
		return err
	}

	auth.Register(srv.API, authSvc)
	audit.Register(srv.API, audit.NewService(auditRec))
	org.Register(srv.API, orgSvc)
	project.Register(srv.API, projectSvc)
	iteration.Register(srv.API, iterationSvc)
	sample.Register(srv.API, sampleSvc)
	experiment.Register(srv.API, experimentSvc)
	page.Register(srv.API, pageSvc)
	artifact.Register(srv.API, artifactSvc)

	httpSrv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           srv.Router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("listening", "addr", httpSrv.Addr, "env", cfg.Env)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return httpSrv.Shutdown(shutdownCtx)
}

func llmsTxtStub(webOrigin string) string {
	return "# Lab Project Management Platform\n\n" +
		"> Agent-friendly research data API. OpenAPI spec: /openapi.json. Interactive docs: /docs.\n\n" +
		"## Auth\n" +
		"Use a Personal Access Token: `Authorization: Bearer pat_...`.\n\n" +
		"## Discovery\n" +
		"- OpenAPI 3.1: /openapi.json\n" +
		"- Docs: /docs\n" +
		"- Web app: " + webOrigin + "\n"
}
