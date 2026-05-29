// Command api is the single binary entrypoint: it loads configuration, opens
// the Postgres pool, runs goose migrations behind an advisory lock, wires the
// chi+huma server and the (eventual) River worker, and starts listening.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"github.com/colnio/project-management-site/internal/admin"
	"github.com/colnio/project-management-site/internal/ai"
	"github.com/colnio/project-management-site/internal/approval"
	"github.com/colnio/project-management-site/internal/artifact"
	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/calendar"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/db"
	"github.com/colnio/project-management-site/internal/experiment"
	"github.com/colnio/project-management-site/internal/inbox"
	"github.com/colnio/project-management-site/internal/iteration"
	"github.com/colnio/project-management-site/internal/jobs"
	labmcp "github.com/colnio/project-management-site/internal/mcp"
	"github.com/colnio/project-management-site/internal/meeting"
	"github.com/colnio/project-management-site/internal/notify"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/page"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/risk"
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

	logger.Info("running River migrations")
	if err := jobs.Migrate(ctx, pool); err != nil {
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

	// Domain module routes. More are registered here as tracks land, e.g.:
	//   project.Register(srv.API, projectSvc)
	orgSvc := org.NewService(pool, cfg, auditRec, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, auditRec, logger)
	iterationSvc := iteration.NewService(pool, projectSvc, auditRec, logger)
	sampleSvc := sample.NewService(pool, projectSvc, auditRec, logger)
	experimentSvc := experiment.NewService(pool, projectSvc, auditRec, logger)
	pageSvc := page.NewService(pool, projectSvc, auditRec, logger)
	artifactSvc, err := artifact.NewService(pool, projectSvc, sampleSvc, experimentSvc, cfg, auditRec, logger)
	if err != nil {
		return err
	}

	// ── River job queue setup ─────────────────────────────────────────────────
	objStore, err := artifact.NewS3Store(cfg)
	if err != nil {
		return fmt.Errorf("build object store: %w", err)
	}

	riverWorkers := river.NewWorkers()
	artifact.RegisterWorkers(riverWorkers, artifact.WorkerDeps{
		Pool:           pool,
		Store:          objStore,
		BucketOrig:     cfg.BucketOriginals,
		BucketRendered: cfg.BucketRendered,
		NBConvertURL:   cfg.NBConvertURL,
		PublicURLBase:  cfg.S3PublicURLBase,
	})

	notifySvc := notify.NewService(pool, cfg, auditRec, logger)
	notify.RegisterWorkers(riverWorkers, notify.WorkerDeps{Pool: pool, Svc: notifySvc})

	riverClient, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		Workers: riverWorkers,
		Queues:  map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: 5}},
		Logger:  logger,
		PeriodicJobs: func() []*river.PeriodicJob {
			loc, locErr := time.LoadLocation(cfg.LabTimezone)
			if locErr != nil {
				loc = time.UTC
				logger.Warn("notify: invalid LAB_TIMEZONE, using UTC", "tz", cfg.LabTimezone, "err", locErr)
			}
			return []*river.PeriodicJob{notify.NewDailyDigestPeriodicJob(cfg.DigestHour, loc)}
		}(),
	})
	if err != nil {
		return fmt.Errorf("build River client: %w", err)
	}

	if err := riverClient.Start(ctx); err != nil {
		return fmt.Errorf("start River client: %w", err)
	}

	// Wire the River-backed enqueuer into the artifact service.
	artifactSvc.SetEnqueuer(artifact.NewRiverEnqueuer(riverClient))

	notifySvc.SetEnqueuer(notify.NewRiverEnqueuer(riverClient))

	riskSvc := risk.NewService(pool, projectSvc, iterationSvc, auditRec, logger)
	calendarSvc := calendar.NewService(pool, projectSvc, auditRec, logger)
	meetingSvc := meeting.NewService(pool, orgSvc, projectSvc, auditRec, logger)
	approvalSvc := approval.NewService(pool, projectSvc, orgSvc, auditRec, cfg, logger)
	orgSvc.SetInviteNotifier(notifySvc)
	approvalSvc.SetApprovalNotifier(notifySvc)

	// AI module (G1/G2/G5): load provider, build client (nil if unavailable).
	aiProvider, aiProvErr := ai.LoadProvider()
	var aiClient ai.Client
	if aiProvErr != nil {
		logger.Warn("ai: provider config error (AI disabled)", "err", aiProvErr)
	} else if aiProvider == nil {
		logger.Warn("ai: provider config not found (AI disabled — create aiconf.local.json to enable)")
	} else {
		logger.Info("ai: provider loaded", "model", aiProvider.Model, "api_base", aiProvider.APIBase)
		// NEVER log aiProvider.Token
		aiClient = ai.NewHTTPClient(aiProvider)
	}
	aiSvc := ai.NewService(pool, cfg, aiClient, authSvc, orgSvc, projectSvc, auditRec, logger)
	aiSvc.SetRiskService(riskSvc)
	inboxSvc := inbox.NewService(pool, orgSvc, riskSvc, aiSvc, projectSvc, approvalSvc, logger)
	notifySvc.SetInbox(inboxSvc)
	notifySvc.SetAuth(authSvc)
	aiSvc.SetPIFlagNotifier(notifySvc)
	riskSvc.SetPIFlagNotifier(notifySvc)

	// Load workflow definitions from the embedded workflows/ directory.
	workflows, wfErr := ai.LoadWorkflows()
	if wfErr != nil {
		return fmt.Errorf("load workflows: %w", wfErr)
	}
	logger.Info("ai: workflows loaded", "count", len(workflows))

	adminSvc := admin.NewService(authSvc, auditRec)
	adminSvc.SetAccountNotifier(notifySvc)
	auth.Register(srv.API, authSvc)
	admin.Register(srv.API, adminSvc)
	audit.Register(srv.API, audit.NewService(auditRec))
	org.Register(srv.API, orgSvc)
	project.Register(srv.API, projectSvc)
	iteration.Register(srv.API, iterationSvc)
	sample.Register(srv.API, sampleSvc)
	experiment.Register(srv.API, experimentSvc)
	page.Register(srv.API, pageSvc)
	artifact.Register(srv.API, artifactSvc)
	calendar.Register(srv.API, calendarSvc)
	risk.Register(srv.API, riskSvc)
	meeting.Register(srv.API, meetingSvc)
	approval.Register(srv.API, approvalSvc)
	inbox.Register(srv.API, inboxSvc)
	notify.Register(srv.API, notifySvc)
	notify.RegisterPublic(srv.Router, notifySvc)
	ai.Register(srv.API, aiSvc)
	ai.RegisterWorkflows(srv.API, aiSvc, workflows)
	// SSE streaming chat — chi route (not huma) because it's Server-Sent Events.
	srv.Router.Post("/v1/ai/conversations/{id}/messages", aiSvc.HandleMessageStream)
	// Public per-user calendar feed (token in URL, no auth middleware); the
	// .ics suffix is captured into {token} and stripped by the handler.
	srv.Router.Get("/v1/cal/{user_id}/{token}", calendarSvc.ICSHandler)

	// F4: generate /llms.txt from the live OpenAPI spec (reflects all registered endpoints).
	srv.MountLLMSTxt(labmcp.LLMSText(srv.API.OpenAPI()))

	// F3: MCP server over SSE at /mcp — wraps the REST API, same PAT auth.
	restBase := "http://127.0.0.1:" + cfg.Port
	mcpSrv := labmcp.NewServer(restBase, logger)
	srv.Router.Mount("/mcp", mcpSrv.Handler())

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

	// Stop River worker pool (drains in-progress jobs).
	if err := riverClient.Stop(shutdownCtx); err != nil {
		logger.Error("river stop", "err", err)
	}

	return httpSrv.Shutdown(shutdownCtx)
}

