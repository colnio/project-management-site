-- +goose Up
-- Email outbox, notification preferences, digest watermarks, admin broadcasts.

CREATE TABLE email_outbox (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid        REFERENCES users(id) ON DELETE SET NULL,
    to_email         text        NOT NULL,
    category         text        NOT NULL,
    template_key     text        NOT NULL,
    payload          jsonb       NOT NULL DEFAULT '{}',
    status           text        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    idempotency_key  text        NOT NULL UNIQUE,
    last_error       text        NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now(),
    sent_at          timestamptz
);

CREATE INDEX email_outbox_status_created_idx ON email_outbox (status, created_at);

CREATE TABLE user_notification_prefs (
    user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel    text        NOT NULL DEFAULT 'email',
    category   text        NOT NULL,
    enabled    boolean     NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, channel, category)
);

CREATE TABLE email_digest_watermarks (
    user_id       uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_sent_at  timestamptz NOT NULL DEFAULT '1970-01-01'::timestamptz
);

CREATE TABLE admin_broadcasts (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by   uuid        NOT NULL REFERENCES users(id),
    subject      text        NOT NULL,
    body         text        NOT NULL,
    audience     text        NOT NULL CHECK (audience IN ('all', 'workspace', 'users')),
    workspace_id uuid,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_broadcasts_created_at_idx ON admin_broadcasts (created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS admin_broadcasts;
DROP TABLE IF EXISTS email_digest_watermarks;
DROP TABLE IF EXISTS user_notification_prefs;
DROP TABLE IF EXISTS email_outbox;
