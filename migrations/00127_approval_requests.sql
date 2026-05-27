-- +goose Up
CREATE TABLE approval_requests (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL,
    iteration_id uuid       NULL,
    created_by  uuid        NOT NULL,
    description text        NOT NULL,
    ai_review   text        NOT NULL DEFAULT '',
    status      text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected')),
    recipients  jsonb       NOT NULL DEFAULT '[]',
    decided_by  uuid        NULL,
    decided_at  timestamptz NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_requests_project_id ON approval_requests (project_id);
CREATE INDEX idx_approval_requests_pending ON approval_requests (project_id) WHERE status = 'pending';

-- +goose Down
DROP TABLE approval_requests;
