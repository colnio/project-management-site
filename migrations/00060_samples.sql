-- +goose Up

-- ---------------------------------------------------------------------------
-- samples: a physical or digital sample scoped to a project.
-- kind is a controlled vocabulary of common lab sample categories.
-- properties is a freeform JSONB document (replace-on-PATCH, no deep merge).
-- description_page_id is intentionally without FK — the page module owns pages.
-- ---------------------------------------------------------------------------
CREATE TABLE samples (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    identifier          text        NOT NULL,
    name                text        NOT NULL DEFAULT '',
    description         text        NOT NULL DEFAULT '',
    kind                text        NOT NULL DEFAULT 'other'
                                    CHECK (kind IN ('precursor','electrode','cell','module','derivative','other')),
    properties          jsonb       NOT NULL DEFAULT '{}',
    status              text        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','consumed','archived','failed')),
    description_page_id uuid        NULL,
    created_by          uuid        NOT NULL REFERENCES users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, identifier)
);

CREATE INDEX samples_project_id_idx ON samples (project_id);

-- ---------------------------------------------------------------------------
-- sample_relations: directed lineage edges between samples.
-- Both samples must belong to the same project (enforced at the app level).
-- ---------------------------------------------------------------------------
CREATE TABLE sample_relations (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_sample_id uuid        NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    child_sample_id  uuid        NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    relation_type    text        NOT NULL
                                 CHECK (relation_type IN ('derived_from','split_from','assembled_into','tested_as','duplicate_of')),
    project_id       uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    notes            text        NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (parent_sample_id, child_sample_id, relation_type)
);

CREATE INDEX sample_relations_parent_idx ON sample_relations (parent_sample_id);
CREATE INDEX sample_relations_child_idx  ON sample_relations (child_sample_id);

-- +goose Down
DROP INDEX IF EXISTS sample_relations_child_idx;
DROP INDEX IF EXISTS sample_relations_parent_idx;
DROP TABLE IF EXISTS sample_relations;
DROP INDEX IF EXISTS samples_project_id_idx;
DROP TABLE IF EXISTS samples;
