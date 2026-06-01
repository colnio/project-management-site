package ai

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
)

// PurgeIdleConversationsArgs triggers deletion of AI chats that have not been
// accessed (opened or messaged) within the configured idle window.
type PurgeIdleConversationsArgs struct{}

func (PurgeIdleConversationsArgs) Kind() string { return "ai_purge_idle_conversations" }

// CleanupWorkerDeps holds dependencies for the idle-conversation reaper.
type CleanupWorkerDeps struct {
	Pool    *pgxpool.Pool
	IdleTTL time.Duration
	Log     *slog.Logger
}

// PurgeIdleConversationsWorker hard-deletes idle conversations (messages and
// tool calls cascade) on a periodic schedule.
type PurgeIdleConversationsWorker struct {
	river.WorkerDefaults[PurgeIdleConversationsArgs]
	deps CleanupWorkerDeps
}

func NewPurgeIdleConversationsWorker(deps CleanupWorkerDeps) *PurgeIdleConversationsWorker {
	return &PurgeIdleConversationsWorker{deps: deps}
}

func (w *PurgeIdleConversationsWorker) Work(ctx context.Context, _ *river.Job[PurgeIdleConversationsArgs]) error {
	deleted, err := deleteIdleConversations(ctx, w.deps.Pool, w.deps.IdleTTL)
	if err != nil {
		return err
	}
	if deleted > 0 && w.deps.Log != nil {
		w.deps.Log.Info("ai: purged idle conversations",
			"count", deleted, "idle_ttl", w.deps.IdleTTL.String())
	}
	return nil
}

// RegisterCleanupWorker adds the idle-conversation reaper to the River worker set.
func RegisterCleanupWorker(workers *river.Workers, deps CleanupWorkerDeps) {
	river.AddWorker(workers, NewPurgeIdleConversationsWorker(deps))
}

// NewPurgeIdleConversationsPeriodicJob returns a River periodic job that enqueues
// an idle-conversation purge once per day. Daily granularity is ample for a
// multi-week TTL.
func NewPurgeIdleConversationsPeriodicJob() *river.PeriodicJob {
	return river.NewPeriodicJob(
		river.PeriodicInterval(24*time.Hour),
		func() (river.JobArgs, *river.InsertOpts) {
			return PurgeIdleConversationsArgs{}, nil
		},
		&river.PeriodicJobOpts{RunOnStart: false},
	)
}
