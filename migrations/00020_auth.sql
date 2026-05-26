-- +goose Up

-- ---------------------------------------------------------------------------
-- users: identity core. Every other module FKs to users(id).
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email          text        NOT NULL UNIQUE,
    display_name   text        NOT NULL DEFAULT '',
    is_system_admin boolean    NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- local_credentials: argon2id password hash for local-login users.
-- ---------------------------------------------------------------------------
CREATE TABLE local_credentials (
    user_id       uuid  PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash text  NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- refresh_sessions: opaque refresh token store (sha256 hex of the token).
-- ---------------------------------------------------------------------------
CREATE TABLE refresh_sessions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  text        NOT NULL,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_sessions_token_hash_idx ON refresh_sessions (token_hash);

-- ---------------------------------------------------------------------------
-- personal_access_tokens: long-lived scoped API tokens.
-- ---------------------------------------------------------------------------
CREATE TABLE personal_access_tokens (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         text        NOT NULL,
    token_hash   text        NOT NULL,
    token_prefix text        NOT NULL,
    scopes       text[]      NOT NULL DEFAULT '{}',
    expires_at   timestamptz NULL,
    revoked_at   timestamptz NULL,
    last_used_at timestamptz NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX personal_access_tokens_prefix_idx ON personal_access_tokens (token_prefix);

-- ---------------------------------------------------------------------------
-- internal_ai_tokens: short-lived scoped tokens minted for AI calls.
-- ---------------------------------------------------------------------------
CREATE TABLE internal_ai_tokens (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_or_run_id uuid      NOT NULL,
    token_hash           text        NOT NULL,
    token_prefix         text        NOT NULL,
    scopes_snapshot      text[]      NOT NULL DEFAULT '{}',
    permissions_snapshot jsonb       NOT NULL DEFAULT '{}',
    expires_at           timestamptz NOT NULL,
    revoked_at           timestamptz NULL,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX internal_ai_tokens_prefix_idx ON internal_ai_tokens (token_prefix);

-- +goose Down
DROP TABLE IF EXISTS internal_ai_tokens;
DROP TABLE IF EXISTS personal_access_tokens;
DROP TABLE IF EXISTS refresh_sessions;
DROP TABLE IF EXISTS local_credentials;
DROP TABLE IF EXISTS users;
