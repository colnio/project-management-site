package audit

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Compile-time interface check.
var _ Recorder = (*PgRecorder)(nil)

// PgRecorder writes audit entries to Postgres. It is safe for concurrent use
// because pgxpool manages connection multiplexing internally.
type PgRecorder struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

// NewRecorder constructs a PgRecorder backed by the given pool.
func NewRecorder(pool *pgxpool.Pool, log *slog.Logger) *PgRecorder {
	return &PgRecorder{pool: pool, log: log}
}

// Record inserts a single audit entry. If e.CreatedAt is zero the DB DEFAULT
// (now()) is used instead. On INSERT failure the error is logged and returned;
// callers decide whether to propagate or ignore (audit is best-effort durable).
func (r *PgRecorder) Record(ctx context.Context, e Entry) error {
	var err error
	if e.CreatedAt.IsZero() {
		_, err = r.pool.Exec(ctx, `
			INSERT INTO audit_log
				(actor, via_token_id, via_ai_conversation_id,
				 action, resource_type, resource_id,
				 request_payload_digest, response_status)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			e.Actor,
			e.ViaTokenID,
			e.ViaAIConversationID,
			e.Action,
			e.ResourceType,
			e.ResourceID,
			e.RequestPayloadDigest,
			e.ResponseStatus,
		)
	} else {
		_, err = r.pool.Exec(ctx, `
			INSERT INTO audit_log
				(actor, via_token_id, via_ai_conversation_id,
				 action, resource_type, resource_id,
				 request_payload_digest, response_status, created_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			e.Actor,
			e.ViaTokenID,
			e.ViaAIConversationID,
			e.Action,
			e.ResourceType,
			e.ResourceID,
			e.RequestPayloadDigest,
			e.ResponseStatus,
			e.CreatedAt,
		)
	}
	if err != nil {
		r.log.Error("audit: failed to record entry",
			"action", e.Action,
			"actor", e.Actor,
			"resource_type", e.ResourceType,
			"resource_id", e.ResourceID,
			"error", err,
		)
		return err
	}
	return nil
}
