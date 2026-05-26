-- +goose Up

-- ---------------------------------------------------------------------------
-- project_events: calendar events associated with a project.
-- iteration_id, sample_id, experiment_id are bare UUIDs (no FK) — integrity
-- is maintained at the application level.
-- ---------------------------------------------------------------------------
CREATE TABLE project_events (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    iteration_id     uuid        NULL,
    sample_id        uuid        NULL,
    experiment_id    uuid        NULL,
    kind             text        NOT NULL DEFAULT 'custom'
                                 CHECK (kind IN ('deadline','milestone_end','meeting','reminder','custom')),
    title            text        NOT NULL,
    description      text        NOT NULL DEFAULT '',
    start_at         timestamptz NOT NULL,
    end_at           timestamptz NULL,
    all_day          boolean     NOT NULL DEFAULT false,
    recurrence_rule  text        NOT NULL DEFAULT '',
    created_by       uuid        NOT NULL REFERENCES users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_events_project_id_idx ON project_events (project_id);
CREATE INDEX project_events_start_at_idx   ON project_events (start_at);

-- ---------------------------------------------------------------------------
-- calendar_subscriptions: per-user iCalendar feed tokens.
-- ---------------------------------------------------------------------------
CREATE TABLE calendar_subscriptions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token           text        NOT NULL UNIQUE,
    scope           text        NOT NULL DEFAULT 'all_visible_projects'
                                CHECK (scope IN ('all_visible_projects','per_project')),
    project_ids     uuid[]      NOT NULL DEFAULT '{}',
    revoked_at      timestamptz NULL,
    last_fetched_at timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calendar_subscriptions_token_idx ON calendar_subscriptions (token);

-- +goose Down
DROP INDEX IF EXISTS calendar_subscriptions_token_idx;
DROP TABLE IF EXISTS calendar_subscriptions;

DROP INDEX IF EXISTS project_events_start_at_idx;
DROP INDEX IF EXISTS project_events_project_id_idx;
DROP TABLE IF EXISTS project_events;
