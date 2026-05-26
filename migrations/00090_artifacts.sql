-- +goose Up

-- ---------------------------------------------------------------------------
-- artifacts: stores metadata for uploaded files associated with a project.
-- The actual objects live in S3/MinIO; this table tracks state and URLs.
-- ---------------------------------------------------------------------------
CREATE TABLE artifacts (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type              text        NOT NULL DEFAULT 'other'
                                  CHECK (type IN ('pdf','ipynb','image','other')),
    filename          text        NOT NULL,
    content_type      text        NOT NULL DEFAULT '',
    size_bytes        bigint      NOT NULL DEFAULT 0,
    storage_key       text        NOT NULL DEFAULT '',
    original_url      text        NOT NULL DEFAULT '',
    rendered_url      text        NOT NULL DEFAULT '',
    thumbnail_url     text        NOT NULL DEFAULT '',
    metadata          jsonb       NOT NULL DEFAULT '{}',
    processing_status text        NOT NULL DEFAULT 'pending'
                                  CHECK (processing_status IN ('pending','processing','done','failed')),
    uploaded_by       uuid        NOT NULL REFERENCES users(id),
    uploaded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artifacts_project_id_idx ON artifacts (project_id);

-- ---------------------------------------------------------------------------
-- sample_artifacts: join table for samples ↔ artifacts.
-- sample_id has no FK (sample module owns that table; integrity is at app layer).
-- ---------------------------------------------------------------------------
CREATE TABLE sample_artifacts (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    sample_id   uuid        NOT NULL,
    artifact_id uuid        NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    role        text        NULL
                            CHECK (role IN ('specimen_image','datasheet','reference','other')),
    attached_by uuid        NOT NULL REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sample_id, artifact_id)
);

CREATE INDEX sample_artifacts_sample_id_idx   ON sample_artifacts (sample_id);
CREATE INDEX sample_artifacts_artifact_id_idx ON sample_artifacts (artifact_id);

-- ---------------------------------------------------------------------------
-- experiment_artifacts: join table for experiments ↔ artifacts.
-- experiment_id has no FK.
-- ---------------------------------------------------------------------------
CREATE TABLE experiment_artifacts (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id uuid        NOT NULL,
    artifact_id   uuid        NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    role          text        NULL
                              CHECK (role IN ('raw_data','analysis','report','calibration','photo','other')),
    attached_by   uuid        NOT NULL REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (experiment_id, artifact_id)
);

CREATE INDEX experiment_artifacts_experiment_id_idx ON experiment_artifacts (experiment_id);
CREATE INDEX experiment_artifacts_artifact_id_idx   ON experiment_artifacts (artifact_id);

-- +goose Down
DROP INDEX IF EXISTS experiment_artifacts_artifact_id_idx;
DROP INDEX IF EXISTS experiment_artifacts_experiment_id_idx;
DROP TABLE IF EXISTS experiment_artifacts;

DROP INDEX IF EXISTS sample_artifacts_artifact_id_idx;
DROP INDEX IF EXISTS sample_artifacts_sample_id_idx;
DROP TABLE IF EXISTS sample_artifacts;

DROP INDEX IF EXISTS artifacts_project_id_idx;
DROP TABLE IF EXISTS artifacts;
