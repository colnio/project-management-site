-- +goose Up
-- Link a persisted tool-call record to the OpenAI tool_call id carried on the
-- assistant message, so the conversation-messages API can enrich each message
-- tool_call with its approval status + the record's UUID (needed to render and
-- target the Approve/Reject controls for suggest_writes proposals).
ALTER TABLE ai_tool_calls ADD COLUMN call_id text NULL;

-- +goose Down
ALTER TABLE ai_tool_calls DROP COLUMN call_id;
