-- +goose Up
ALTER TABLE pages ADD COLUMN slot text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS pages_parent_slot_idx ON pages (parent_type, parent_id, slot);

-- +goose Down
DROP INDEX IF EXISTS pages_parent_slot_idx;
ALTER TABLE pages DROP COLUMN IF EXISTS slot;
