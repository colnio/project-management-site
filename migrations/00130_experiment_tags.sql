-- +goose Up

ALTER TABLE experiments
    ADD COLUMN tags jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill single-tag experiments from legacy method column.
UPDATE experiments
SET tags = jsonb_build_array(method)
WHERE method IS NOT NULL
  AND method <> ''
  AND method <> 'custom'
  AND tags = '[]'::jsonb;

-- +goose Down

ALTER TABLE experiments DROP COLUMN IF EXISTS tags;
