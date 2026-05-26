-- +goose Up

-- ---------------------------------------------------------------------------
-- iterations: a planning unit (sprint/cycle) scoped to a project.
-- summary_page_id has no FK — the page module owns the pages table;
-- integrity is maintained at the application level.
-- ---------------------------------------------------------------------------
CREATE TABLE iterations (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           text        NOT NULL,
    description     text        NOT NULL DEFAULT '',
    status          text        NOT NULL DEFAULT 'planned'
                                CHECK (status IN ('planned','active','done','blocked')),
    position        int         NOT NULL DEFAULT 0,
    start_at        timestamptz NULL,
    end_at          timestamptz NULL,
    summary_page_id uuid        NULL,
    created_by      uuid        NOT NULL REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX iterations_project_id_idx ON iterations (project_id);

-- +goose Down
DROP INDEX IF EXISTS iterations_project_id_idx;
DROP TABLE IF EXISTS iterations;
