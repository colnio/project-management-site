-- +goose Up

CREATE TABLE user_appearance (
    user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    prefs      jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down

DROP TABLE user_appearance;
