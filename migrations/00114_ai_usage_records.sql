-- +goose Up

-- ---------------------------------------------------------------------------
-- ai_usage_records: per-call token usage and cost metering.
-- ---------------------------------------------------------------------------
CREATE TABLE ai_usage_records (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       uuid        NULL,
    project_id         uuid        NULL,
    user_id            uuid        NULL,
    feature            text        NOT NULL CHECK (feature IN ('chat', 'workflow', 'tool_call')),
    model              text        NOT NULL DEFAULT '',
    prompt_tokens      int         NOT NULL DEFAULT 0,
    completion_tokens  int         NOT NULL DEFAULT 0,
    usd_cost           numeric     NOT NULL DEFAULT 0,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_records_workspace_id_idx  ON ai_usage_records (workspace_id, created_at);
CREATE INDEX ai_usage_records_user_id_idx        ON ai_usage_records (user_id);

-- +goose Down
DROP INDEX IF EXISTS ai_usage_records_user_id_idx;
DROP INDEX IF EXISTS ai_usage_records_workspace_id_idx;
DROP TABLE IF EXISTS ai_usage_records;
