-- +goose Up

-- Add seq and code columns to experiments.
ALTER TABLE experiments ADD COLUMN seq  int  NULL;
ALTER TABLE experiments ADD COLUMN code text NULL;

-- Backfill seq using a per-project row_number ordered by created_at.
UPDATE experiments e
SET seq = sub.rn
FROM (
    SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
    FROM experiments
) sub
WHERE e.id = sub.id;

-- Derive code from seq for existing rows.
UPDATE experiments SET code = 'EX-' || seq WHERE code IS NULL;

-- Add unique constraint on (project_id, seq).
CREATE UNIQUE INDEX experiments_project_id_seq_idx ON experiments (project_id, seq);

-- +goose Down
DROP INDEX IF EXISTS experiments_project_id_seq_idx;
ALTER TABLE experiments DROP COLUMN IF EXISTS code;
ALTER TABLE experiments DROP COLUMN IF EXISTS seq;
