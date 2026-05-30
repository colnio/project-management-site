-- +goose Up

-- Project-scoped sample tags (labels attached to samples).
CREATE TABLE project_sample_tags (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label       text        NOT NULL,
    position    int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_sample_tags_label_unique UNIQUE (project_id, label)
);

CREATE INDEX project_sample_tags_project_id_idx ON project_sample_tags (project_id);

ALTER TABLE samples
    ADD COLUMN tags jsonb NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down

ALTER TABLE samples DROP COLUMN IF EXISTS tags;

DROP INDEX IF EXISTS project_sample_tags_project_id_idx;
DROP TABLE IF EXISTS project_sample_tags;
