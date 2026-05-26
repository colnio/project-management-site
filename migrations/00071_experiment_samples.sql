-- +goose Up

-- ---------------------------------------------------------------------------
-- experiment_samples: join table linking experiments to samples.
-- sample_id has no FK — the sample module owns the samples table;
-- integrity is maintained at the application level.
-- ---------------------------------------------------------------------------
CREATE TABLE experiment_samples (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id uuid        NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    sample_id     uuid        NOT NULL,
    role          text        NULL
                              CHECK (role IN ('subject','reference','control','byproduct')),
    note          text        NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (experiment_id, sample_id)
);

CREATE INDEX experiment_samples_experiment_id_idx ON experiment_samples (experiment_id);
CREATE INDEX experiment_samples_sample_id_idx     ON experiment_samples (sample_id);

-- +goose Down
DROP INDEX IF EXISTS experiment_samples_sample_id_idx;
DROP INDEX IF EXISTS experiment_samples_experiment_id_idx;
DROP TABLE IF EXISTS experiment_samples;
