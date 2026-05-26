-- +goose Up

-- ---------------------------------------------------------------------------
-- ai_tool_calls: records of tool invocations, including proposed writes.
-- ---------------------------------------------------------------------------
CREATE TABLE ai_tool_calls (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  uuid        NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    run_id           uuid        NULL,
    tool             text        NOT NULL,
    input_json       jsonb       NULL,
    output_json      jsonb       NULL,
    status           text        NOT NULL CHECK (status IN ('proposed', 'approved', 'executed', 'rejected')),
    executed_by      uuid        NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_tool_calls_conversation_id_idx ON ai_tool_calls (conversation_id);
CREATE INDEX ai_tool_calls_status_idx          ON ai_tool_calls (status);

-- +goose Down
DROP INDEX IF EXISTS ai_tool_calls_status_idx;
DROP INDEX IF EXISTS ai_tool_calls_conversation_id_idx;
DROP TABLE IF EXISTS ai_tool_calls;
