-- +goose Up

-- Project-scoped experiment tags (labels attached to experiments via experiments.method).
CREATE TABLE project_experiment_tags (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label       text        NOT NULL,
    position    int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_experiment_tags_label_unique UNIQUE (project_id, label)
);

CREATE INDEX project_experiment_tags_project_id_idx ON project_experiment_tags (project_id);

-- Allow any tag label on experiments (was fixed enum).
ALTER TABLE experiments DROP CONSTRAINT IF EXISTS experiments_method_check;

-- +goose Down

ALTER TABLE experiments ADD CONSTRAINT experiments_method_check
    CHECK (method IN ('cycling','synthesis','SEM','XRD','EIS','weighing','drying','custom'));

DROP INDEX IF EXISTS project_experiment_tags_project_id_idx;
DROP TABLE IF EXISTS project_experiment_tags;
