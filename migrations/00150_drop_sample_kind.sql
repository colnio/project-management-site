-- 00150_drop_sample_kind.sql
-- The sample `kind` taxonomy was removed from the product. The column is kept
-- (dormant, nullable, unconstrained) so existing values are not lost and the
-- change is reversible; application code no longer reads or writes it.

-- +goose Up
ALTER TABLE samples ALTER COLUMN kind DROP DEFAULT;
ALTER TABLE samples ALTER COLUMN kind DROP NOT NULL;
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_kind_check;

-- +goose Down
UPDATE samples SET kind = 'other' WHERE kind IS NULL OR kind NOT IN
  ('precursor','electrode','cell','module','derivative','other');
ALTER TABLE samples ADD CONSTRAINT samples_kind_check
  CHECK (kind IN ('precursor','electrode','cell','module','derivative','other'));
ALTER TABLE samples ALTER COLUMN kind SET DEFAULT 'other';
ALTER TABLE samples ALTER COLUMN kind SET NOT NULL;
