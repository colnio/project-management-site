-- +goose Up

-- ---------------------------------------------------------------------------
-- iteration_samples: join table linking an iteration to sample IDs.
-- sample_id has NO foreign key — the sample module owns the samples table;
-- integrity is maintained at the application level.
-- ---------------------------------------------------------------------------
CREATE TABLE iteration_samples (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    iteration_id uuid        NOT NULL REFERENCES iterations(id) ON DELETE CASCADE,
    sample_id    uuid        NOT NULL,
    role         text        NULL CHECK (role IN ('input','output','passthrough')),
    note         text        NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (iteration_id, sample_id)
);

CREATE INDEX iteration_samples_iteration_id_idx ON iteration_samples (iteration_id);

-- +goose Down
DROP INDEX IF EXISTS iteration_samples_iteration_id_idx;
DROP TABLE IF EXISTS iteration_samples;
