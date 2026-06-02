-- +goose Up
ALTER TABLE ai_conversations ADD COLUMN last_accessed_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows to now() so the idle reaper grants every existing
-- conversation a fresh window from migration time (avoids mass-deletion of old chats).
UPDATE ai_conversations SET last_accessed_at = now();

CREATE INDEX ai_conversations_last_accessed_idx ON ai_conversations (last_accessed_at);

-- +goose Down
DROP INDEX IF EXISTS ai_conversations_last_accessed_idx;
ALTER TABLE ai_conversations DROP COLUMN last_accessed_at;
