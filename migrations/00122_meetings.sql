-- +goose Up
CREATE TABLE meetings (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    uuid        NULL REFERENCES projects(id) ON DELETE CASCADE,
    title         text        NOT NULL,
    kind          text        NOT NULL DEFAULT 'sync'
                              CHECK (kind IN ('sync','review','planning','retro','other')),
    chair         uuid        NULL REFERENCES users(id),
    start_at      timestamptz NOT NULL,
    end_at        timestamptz NULL,
    location      text        NOT NULL DEFAULT '',
    agenda        text        NOT NULL DEFAULT '',
    notes         text        NOT NULL DEFAULT '',
    attendees     jsonb       NOT NULL DEFAULT '[]',
    decisions     jsonb       NOT NULL DEFAULT '[]',
    action_items  jsonb       NOT NULL DEFAULT '[]',
    created_by    uuid        NOT NULL REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meetings_workspace_start_idx ON meetings (workspace_id, start_at);

-- +goose Down
DROP INDEX IF EXISTS meetings_workspace_start_idx;
DROP TABLE IF EXISTS meetings;
