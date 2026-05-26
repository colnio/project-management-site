-- +goose Up

-- ---------------------------------------------------------------------------
-- autonomy_configs: per-workspace or per-project AI autonomy settings.
-- ---------------------------------------------------------------------------
CREATE TABLE autonomy_configs (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    scope       text        NOT NULL CHECK (scope IN ('workspace', 'project')),
    scope_id    uuid        NOT NULL,
    mode        text        NOT NULL DEFAULT 'read_only'
                            CHECK (mode IN ('read_only', 'suggest_writes', 'auto_routine', 'full')),
    allowed_tools text[]    NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (scope, scope_id)
);

-- +goose Down
DROP TABLE IF EXISTS autonomy_configs;
