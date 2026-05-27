-- +goose Up
ALTER TABLE ai_conversations ADD COLUMN skill text;

-- +goose Down
ALTER TABLE ai_conversations DROP COLUMN skill;
