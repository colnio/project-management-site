-- +goose Up

-- ---------------------------------------------------------------------------
-- experiments: a lab experiment scoped to a project.
-- iteration_id has no FK — the iteration module owns the iterations table.
-- notes_page_id has no FK — the page module owns the pages table.
-- ---------------------------------------------------------------------------
CREATE TABLE experiments (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    iteration_id    uuid        NULL,
    method          text        NOT NULL DEFAULT 'custom'
                                CHECK (method IN ('cycling','synthesis','SEM','XRD','EIS','weighing','drying','custom')),
    parameters      jsonb       NOT NULL DEFAULT '{}',
    result_summary  text        NOT NULL DEFAULT '',
    notes_page_id   uuid        NULL,
    performed_by    uuid        NULL REFERENCES users(id),
    performed_at    timestamptz NULL,
    status          text        NOT NULL DEFAULT 'planned'
                                CHECK (status IN ('planned','in_progress','completed','failed')),
    created_by      uuid        NOT NULL REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX experiments_project_id_idx   ON experiments (project_id);
CREATE INDEX experiments_iteration_id_idx ON experiments (iteration_id);

-- +goose Down
DROP INDEX IF EXISTS experiments_iteration_id_idx;
DROP INDEX IF EXISTS experiments_project_id_idx;
DROP TABLE IF EXISTS experiments;
