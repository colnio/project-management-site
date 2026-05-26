-- +goose Up

-- ---------------------------------------------------------------------------
-- project_collaborations: per-project collaborator role assignment.
--
-- NOTE: there is intentionally NO foreign key on project_id. The project
-- table is owned by the project module (B1) which may not yet exist at
-- migration time. The org module treats project_id as an opaque UUID.
-- Application-level referential integrity is maintained by the project
-- module deleting collaborations when a project is deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE project_collaborations (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid        NOT NULL,
    user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       text        NOT NULL CHECK (role IN ('owner','editor','viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, user_id)
);

CREATE INDEX project_collaborations_project_id_idx ON project_collaborations (project_id);

-- +goose Down
DROP INDEX IF EXISTS project_collaborations_project_id_idx;
DROP TABLE IF EXISTS project_collaborations;
