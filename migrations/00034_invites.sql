-- +goose Up

-- ---------------------------------------------------------------------------
-- invites: one-time workspace invitation tokens.
-- token_hash stores sha256(raw_token) — the raw token is only ever emailed.
-- ---------------------------------------------------------------------------
CREATE TABLE invites (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email            text        NOT NULL,
    workspace_id     uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role             text        NOT NULL CHECK (role IN ('owner','admin','member')),
    invited_by       uuid        NOT NULL REFERENCES users(id),
    token_hash       text        NOT NULL,
    expires_at       timestamptz NOT NULL,
    accepted_at      timestamptz NULL,
    accepted_as_user uuid        NULL REFERENCES users(id),
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invites_token_hash_idx ON invites (token_hash);

-- +goose Down
DROP INDEX IF EXISTS invites_token_hash_idx;
DROP TABLE IF EXISTS invites;
