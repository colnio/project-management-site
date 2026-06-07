-- 00149_project_owner.sql
-- Give every project an explicit owner of record so ownership can be displayed
-- and transferred. Defaults to the project creator.

-- +goose Up
ALTER TABLE projects ADD COLUMN owner_id uuid REFERENCES users(id);
UPDATE projects SET owner_id = created_by WHERE owner_id IS NULL;
ALTER TABLE projects ALTER COLUMN owner_id SET NOT NULL;

-- +goose Down
ALTER TABLE projects DROP COLUMN owner_id;
