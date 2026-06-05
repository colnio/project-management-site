-- +goose Up

CREATE TABLE feedback (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category        text        NOT NULL DEFAULT 'other'
                                CHECK (category IN ('bug','idea','other')),
    message         text        NOT NULL,
    status          text        NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new','acknowledged')),
    acknowledged_by uuid        NULL REFERENCES users(id),
    acknowledged_at timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_status_created_idx ON feedback (status, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS feedback;
