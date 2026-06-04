-- +goose Up
-- Tasks can now reference people and other projects (in addition to samples,
-- experiments, and pages), and store a denormalized display label so a
-- cross-workspace reference chip renders without an extra lookup.
ALTER TABLE task_references DROP CONSTRAINT task_references_ref_type_check;
ALTER TABLE task_references ADD CONSTRAINT task_references_ref_type_check
    CHECK (ref_type IN ('sample','experiment','page','user','project'));
ALTER TABLE task_references ADD COLUMN label text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE task_references DROP COLUMN IF EXISTS label;
ALTER TABLE task_references DROP CONSTRAINT task_references_ref_type_check;
ALTER TABLE task_references ADD CONSTRAINT task_references_ref_type_check
    CHECK (ref_type IN ('sample','experiment','page'));
