-- +goose Up
CREATE TABLE ai_workflow_runs (
    id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_key     text         NOT NULL,
    project_id       uuid         NULL REFERENCES projects(id) ON DELETE CASCADE,
    sample_id        uuid         NULL,
    experiment_id    uuid         NULL,
    started_by       uuid         NOT NULL REFERENCES users(id),
    status           text         NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    step_results     jsonb        NOT NULL DEFAULT '{}',
    output           jsonb,
    result_page_id   uuid         NULL,
    error            text         NOT NULL DEFAULT '',
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX ai_workflow_runs_project_id_idx ON ai_workflow_runs (project_id);
CREATE INDEX ai_workflow_runs_started_by_idx ON ai_workflow_runs (started_by);

-- +goose Down
DROP TABLE IF EXISTS ai_workflow_runs;
