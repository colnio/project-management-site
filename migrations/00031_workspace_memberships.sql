-- +goose Up

-- ---------------------------------------------------------------------------
-- workspace_memberships: per-workspace role assignment for users.
-- ---------------------------------------------------------------------------
CREATE TABLE workspace_memberships (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         text        NOT NULL CHECK (role IN ('owner','admin','member')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

-- +goose Down
DROP TABLE IF EXISTS workspace_memberships;
