-- +goose Up
CREATE TABLE approval_comments (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_request_id uuid        NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
    author_id           uuid        NOT NULL REFERENCES users(id),
    body                text        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_comments_request_created ON approval_comments (approval_request_id, created_at);

-- +goose Down
DROP TABLE approval_comments;
