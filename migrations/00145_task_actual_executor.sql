-- +goose Up
ALTER TABLE tasks ADD COLUMN actual_executor_id uuid NULL REFERENCES users(id);

-- +goose Down
ALTER TABLE tasks DROP COLUMN IF EXISTS actual_executor_id;
