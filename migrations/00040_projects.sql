-- +goose Up

-- ---------------------------------------------------------------------------
-- projects: a research project scoped to a workspace. Visibility can be
-- 'workspace' (all members can read) or 'private' (collaborators only).
-- summary_page_id has no FK — the page module (B3) owns pages; the FK is
-- maintained at the application level.
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            text        NOT NULL,
    description     text        NOT NULL DEFAULT '',
    visibility      text        NOT NULL DEFAULT 'workspace'
                                CHECK (visibility IN ('workspace','private')),
    summary_page_id uuid        NULL,
    created_by      uuid        NOT NULL REFERENCES users(id),
    archived_at     timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_workspace_id_idx ON projects (workspace_id);

-- +goose Down
DROP INDEX IF EXISTS projects_workspace_id_idx;
DROP TABLE IF EXISTS projects;
