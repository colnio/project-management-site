-- +goose Up
CREATE TABLE tasks (
    id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           uuid         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    iteration_id         uuid         NULL REFERENCES iterations(id) ON DELETE SET NULL,
    seq                  int          NOT NULL,
    title                text         NOT NULL,
    description          text         NOT NULL DEFAULT '',
    status               text         NOT NULL DEFAULT 'todo'
                                      CHECK (status IN ('backlog','todo','in_progress','done','cancelled')),
    assignee_user_id     uuid         NULL REFERENCES users(id),
    planned_start_at     timestamptz  NULL,
    estimated_finish_at  timestamptz  NULL,
    started_at           timestamptz  NULL,
    finished_at          timestamptz  NULL,
    created_by           uuid         NOT NULL REFERENCES users(id),
    created_at           timestamptz  NOT NULL DEFAULT now(),
    updated_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX tasks_project_id_idx   ON tasks (project_id);
CREATE INDEX tasks_iteration_id_idx ON tasks (iteration_id);
CREATE INDEX tasks_assignee_idx     ON tasks (assignee_user_id);
CREATE INDEX tasks_status_idx       ON tasks (status);

-- Polymorphic links from a task to the artifacts it produced (samples /
-- experiments / pages). ref_id is a bare uuid (no FK) matching the
-- project_events cross-module reference convention.
CREATE TABLE task_references (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     uuid         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    ref_type    text         NOT NULL CHECK (ref_type IN ('sample','experiment','page')),
    ref_id      uuid         NOT NULL,
    created_by  uuid         NOT NULL REFERENCES users(id),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (task_id, ref_type, ref_id)
);

CREATE INDEX task_references_task_id_idx ON task_references (task_id);

-- Append-only activity timeline: status changes, reassignments, reopens,
-- delays, comments, and reference add/remove. `reason` holds the cancel
-- reason / delay justification / reopen+reassign comment / free comment.
CREATE TABLE task_progress (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id       uuid         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id     uuid         NOT NULL REFERENCES users(id),
    event_type    text         NOT NULL CHECK (event_type IN (
                                  'created','status_change','reassign','reopen',
                                  'delay','comment','reference_added','reference_removed')),
    from_status   text         NULL,
    to_status     text         NULL,
    from_assignee uuid         NULL,
    to_assignee   uuid         NULL,
    reason        text         NOT NULL DEFAULT '',
    created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX task_progress_task_created_idx ON task_progress (task_id, created_at);

-- Link calendar events to tasks so planned-start / estimated-finish surface on
-- the project calendar and the .ics feed. The partial unique index backs the
-- ON CONFLICT (task_id) upsert in calendar.UpsertTaskEvent.
ALTER TABLE project_events ADD COLUMN task_id uuid NULL;
CREATE INDEX project_events_task_id_idx ON project_events (task_id);
CREATE UNIQUE INDEX project_events_task_id_unique_idx
    ON project_events (task_id) WHERE task_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS project_events_task_id_unique_idx;
DROP INDEX IF EXISTS project_events_task_id_idx;
ALTER TABLE project_events DROP COLUMN IF EXISTS task_id;
DROP INDEX IF EXISTS task_progress_task_created_idx;
DROP TABLE IF EXISTS task_progress;
DROP INDEX IF EXISTS task_references_task_id_idx;
DROP TABLE IF EXISTS task_references;
DROP INDEX IF EXISTS tasks_status_idx;
DROP INDEX IF EXISTS tasks_assignee_idx;
DROP INDEX IF EXISTS tasks_iteration_id_idx;
DROP INDEX IF EXISTS tasks_project_id_idx;
DROP TABLE IF EXISTS tasks;
