package notify

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
)

// SendEmailArgs delivers one email_outbox row.
type SendEmailArgs struct {
	OutboxID uuid.UUID `json:"outbox_id"`
}

func (SendEmailArgs) Kind() string { return "send_email" }

// BuildDigestArgs triggers daily digest fan-out for all eligible users.
type BuildDigestArgs struct{}

func (BuildDigestArgs) Kind() string { return "build_daily_digest" }

// Enqueuer schedules River jobs.
type Enqueuer interface {
	EnqueueSendEmail(ctx context.Context, outboxID uuid.UUID) error
	EnqueueBuildDigest(ctx context.Context) error
}

type riverEnqueuer struct {
	client *river.Client[pgx.Tx]
}

// NewRiverEnqueuer builds an Enqueuer backed by River.
func NewRiverEnqueuer(client *river.Client[pgx.Tx]) Enqueuer {
	return &riverEnqueuer{client: client}
}

func (e *riverEnqueuer) EnqueueSendEmail(ctx context.Context, outboxID uuid.UUID) error {
	_, err := e.client.Insert(ctx, SendEmailArgs{OutboxID: outboxID}, nil)
	if err != nil {
		return fmt.Errorf("enqueue send_email: %w", err)
	}
	return nil
}

func (e *riverEnqueuer) EnqueueBuildDigest(ctx context.Context) error {
	_, err := e.client.Insert(ctx, BuildDigestArgs{}, nil)
	if err != nil {
		return fmt.Errorf("enqueue build_daily_digest: %w", err)
	}
	return nil
}

// WorkerDeps holds dependencies for notify River workers.
type WorkerDeps struct {
	Pool *pgxpool.Pool
	Svc  *Service
}

// SendEmailWorker sends a single outbox message.
type SendEmailWorker struct {
	river.WorkerDefaults[SendEmailArgs]
	deps WorkerDeps
}

func NewSendEmailWorker(deps WorkerDeps) *SendEmailWorker {
	return &SendEmailWorker{deps: deps}
}

func (w *SendEmailWorker) Work(ctx context.Context, job *river.Job[SendEmailArgs]) error {
	return w.deps.Svc.deliverOutbox(ctx, job.Args.OutboxID)
}

// BuildDigestWorker enqueues per-user digest emails.
type BuildDigestWorker struct {
	river.WorkerDefaults[BuildDigestArgs]
	deps WorkerDeps
}

func NewBuildDigestWorker(deps WorkerDeps) *BuildDigestWorker {
	return &BuildDigestWorker{deps: deps}
}

func (w *BuildDigestWorker) Work(ctx context.Context, _ *river.Job[BuildDigestArgs]) error {
	return w.deps.Svc.runDailyDigest(ctx)
}

// RegisterWorkers adds notify workers to the River worker set.
func RegisterWorkers(workers *river.Workers, deps WorkerDeps) {
	river.AddWorker(workers, NewSendEmailWorker(deps))
	river.AddWorker(workers, NewBuildDigestWorker(deps))
}
