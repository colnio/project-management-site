-- +goose Up

-- ---------------------------------------------------------------------------
-- audit_log: immutable trail of every mutation, AI tool call, and admin
-- override. Partitioning upgrade path: when the table exceeds ~50M rows,
-- convert to RANGE partitioning on created_at (monthly buckets). The schema
-- is deliberately compatible with that conversion (no serial/sequence PK,
-- timestamptz partition key). For v1 the table ships as a plain heap table
-- because partitioning adds operational complexity before scale demands it.
-- To partition: CREATE TABLE audit_log_YYYY_MM PARTITION OF audit_log
-- FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01'); attach_partition.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor                  uuid        NOT NULL,
    via_token_id           uuid        NULL,
    via_ai_conversation_id uuid        NULL,
    action                 text        NOT NULL,
    resource_type          text        NOT NULL,
    resource_id            text        NOT NULL,
    request_payload_digest text        NOT NULL DEFAULT '',
    response_status        int         NOT NULL DEFAULT 0,
    created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_actor_idx        ON audit_log (actor);
CREATE INDEX audit_log_resource_idx     ON audit_log (resource_type, resource_id);
CREATE INDEX audit_log_created_at_idx   ON audit_log (created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS audit_log;
