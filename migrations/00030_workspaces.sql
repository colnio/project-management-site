-- +goose Up

-- ---------------------------------------------------------------------------
-- workspaces: top-level organisational unit. Every project lives in exactly
-- one workspace. Slug is a URL-safe identifier derived from the name.
-- ---------------------------------------------------------------------------
CREATE TABLE workspaces (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    slug       text        NOT NULL UNIQUE,
    created_by uuid        NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS workspaces;
