-- +goose Up

-- ---------------------------------------------------------------------------
-- wiki_pages: allow site-global wiki pages by making project_id nullable
-- and extending the parent_type check constraint to include 'wiki'.
-- Wiki pages use parent_type='wiki' with project_id=NULL and a fixed
-- parent_id sentinel (all zeros UUID) to represent the global wiki.
-- ---------------------------------------------------------------------------
ALTER TABLE pages ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_parent_type_check;
ALTER TABLE pages ADD CONSTRAINT pages_parent_type_check
    CHECK (parent_type IN ('project','iteration','sample','experiment','wiki'));

-- +goose Down
-- Remove wiki pages before reverting schema so constraints can be re-applied cleanly.
DELETE FROM pages WHERE parent_type = 'wiki';

ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_parent_type_check;
ALTER TABLE pages ADD CONSTRAINT pages_parent_type_check
    CHECK (parent_type IN ('project','iteration','sample','experiment'));

ALTER TABLE pages ALTER COLUMN project_id SET NOT NULL;
