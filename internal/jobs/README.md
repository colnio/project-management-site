# Package `jobs`

Manages River (Postgres-backed, in-process job queue) migrations and provides
the single entry-point for running them on boot.

## Purpose

River stores its job rows in Postgres tables (`river_job`, `river_queue`,
`river_leader`, etc.) that must exist before the River client starts. `Migrate`
creates those tables idempotently after the application's goose migrations run.

## Usage in `cmd/api/main.go`

```go
// After goose migrations:
if err := jobs.Migrate(ctx, pool); err != nil {
    return err
}
```

## `Migrate`

```go
func Migrate(ctx context.Context, pool *pgxpool.Pool) error
```

Runs `rivermigrate.Migrate(ctx, rivermigrate.DirectionUp, nil)` using the
`riverpgxv5` driver backed by the application's pgx pool. Idempotent — safe to
call on every boot.

## Workers / clients

Workers and River clients live in domain modules, not here. The `artifact`
module owns `ProcessArtifactWorker`, `RegisterWorkers`, and `NewRiverEnqueuer`.
`cmd/api/main.go` wires them together:

1. Calls `jobs.Migrate` to ensure River tables exist.
2. Builds `river.NewWorkers()` and calls `artifact.RegisterWorkers(workers, deps)`.
3. Calls `river.NewClient(riverpgxv5.New(pool), &river.Config{Workers: ..., Queues: ...})`.
4. Calls `client.Start(ctx)` before the HTTP server starts.
5. Calls `client.Stop(shutdownCtx)` during graceful shutdown.
