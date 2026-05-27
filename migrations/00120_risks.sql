-- +goose Up
CREATE TABLE risks (
    id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           uuid         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    iteration_id         uuid         NULL REFERENCES iterations(id) ON DELETE CASCADE,
    seq                  int          NOT NULL,
    title                text         NOT NULL,
    likelihood           text         NOT NULL CHECK (likelihood IN ('high','med','low')),
    impact_headline      text         NOT NULL DEFAULT '',
    impact_description   text         NOT NULL DEFAULT '',
    mitigation           text         NOT NULL DEFAULT '',
    plan_b               text         NOT NULL DEFAULT '',
    status               text         NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigated','accepted','closed')),
    flagged_for_pi_review boolean     NOT NULL DEFAULT false,
    source               text         NOT NULL DEFAULT 'human' CHECK (source IN ('human','ai')),
    workflow_run_id      uuid         NULL,
    created_by           uuid         NOT NULL REFERENCES users(id),
    created_at           timestamptz  NOT NULL DEFAULT now(),
    updated_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX risks_project_id_idx ON risks (project_id);
CREATE INDEX risks_iteration_id_idx ON risks (iteration_id);

-- +goose Down
DROP TABLE IF EXISTS risks;
