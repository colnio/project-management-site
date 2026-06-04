-- +goose Up
-- Persistent record of "@person" mentions, the source of truth for mention
-- inbox items and the mention email notification. The UNIQUE constraint makes
-- re-mentions idempotent (editing a page/task that already mentions someone does
-- not re-notify).
CREATE TABLE mentions (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    mentioned_user_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id           uuid        NOT NULL REFERENCES users(id),
    source_type        text        NOT NULL CHECK (source_type IN ('task','page')),
    source_id          uuid        NOT NULL,
    project_id         uuid        NULL,
    workspace_id       uuid        NULL,
    link               text        NOT NULL DEFAULT '',
    snippet            text        NOT NULL DEFAULT '',
    created_at         timestamptz NOT NULL DEFAULT now(),
    read_at            timestamptz NULL,
    UNIQUE (mentioned_user_id, source_type, source_id)
);

CREATE INDEX mentions_user_created_idx ON mentions (mentioned_user_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS mentions_user_created_idx;
DROP TABLE IF EXISTS mentions;
