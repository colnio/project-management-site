-- 00147_global_artifacts.sql
-- Allow artifacts to be site-global (not tied to a project) so the wiki can
-- host uploaded images. project_id NULL means a global/wiki artifact.

-- +goose Up
ALTER TABLE artifacts ALTER COLUMN project_id DROP NOT NULL;

-- +goose Down
DELETE FROM artifacts WHERE project_id IS NULL;
ALTER TABLE artifacts ALTER COLUMN project_id SET NOT NULL;
