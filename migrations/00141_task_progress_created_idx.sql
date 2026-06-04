-- +goose Up
-- The activity feed orders task events across all tasks by time; the existing
-- (task_id, created_at) index can't serve a global created_at ordering.
CREATE INDEX task_progress_created_at_idx ON task_progress (created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS task_progress_created_at_idx;
