-- +goose Up

-- ---------------------------------------------------------------------------
-- ai_conversations: a chat session tied to a project and started by a user.
-- ---------------------------------------------------------------------------
CREATE TABLE ai_conversations (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    started_by   uuid        NOT NULL REFERENCES users(id),
    title        text        NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_project_id_idx ON ai_conversations (project_id);
CREATE INDEX ai_conversations_started_by_idx ON ai_conversations (started_by);

-- +goose Down
DROP INDEX IF EXISTS ai_conversations_started_by_idx;
DROP INDEX IF EXISTS ai_conversations_project_id_idx;
DROP TABLE IF EXISTS ai_conversations;
