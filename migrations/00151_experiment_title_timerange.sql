-- +goose Up

-- Add an explicit title (name) and an experiment time range.
-- Long experiments span multiple days, so a single performed_at is not enough.
-- performed_at is kept for backward compatibility; started_at is backfilled from it.
ALTER TABLE experiments ADD COLUMN title      text        NOT NULL DEFAULT '';
ALTER TABLE experiments ADD COLUMN started_at timestamptz NULL;
ALTER TABLE experiments ADD COLUMN ended_at   timestamptz NULL;

-- Preserve existing dates: treat the old single timestamp as the start.
UPDATE experiments SET started_at = performed_at WHERE performed_at IS NOT NULL;

-- +goose Down
ALTER TABLE experiments DROP COLUMN IF EXISTS ended_at;
ALTER TABLE experiments DROP COLUMN IF EXISTS started_at;
ALTER TABLE experiments DROP COLUMN IF EXISTS title;
