-- +goose Up

-- ---------------------------------------------------------------------------
-- ai_messages: individual messages in an AI conversation, in sequence order.
-- ---------------------------------------------------------------------------
CREATE TABLE ai_messages (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  uuid        NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    seq              int         NOT NULL,
    role             text        NOT NULL,
    content          text        NOT NULL DEFAULT '',
    tool_calls       jsonb       NULL,
    tool_call_id     text        NOT NULL DEFAULT '',
    name             text        NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_messages_conversation_id_seq_idx ON ai_messages (conversation_id, seq);

-- +goose Down
DROP INDEX IF EXISTS ai_messages_conversation_id_seq_idx;
DROP TABLE IF EXISTS ai_messages;
