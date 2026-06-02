-- +goose Up
ALTER TABLE ai_workflow_runs ADD COLUMN iteration_id uuid NULL REFERENCES iterations(id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE ai_workflow_runs DROP COLUMN iteration_id;
