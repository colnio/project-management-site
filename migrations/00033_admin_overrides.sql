-- +goose Up

-- ---------------------------------------------------------------------------
-- admin_overrides: grants a user at-least-viewer access on any project inside
-- the workspace, regardless of project visibility or collaborator list.
-- ---------------------------------------------------------------------------
CREATE TABLE admin_overrides (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

-- +goose Down
DROP TABLE IF EXISTS admin_overrides;
