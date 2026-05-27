-- +goose Up
-- Supporting index for the inbox aggregation endpoint.
-- ai_tool_calls already has an index on status; risks has one on project_id.
-- This migration is intentionally minimal: all source tables already exist.
CREATE INDEX IF NOT EXISTS risks_flagged_pi_idx
    ON risks (project_id, flagged_for_pi_review)
    WHERE flagged_for_pi_review = true;

-- +goose Down
DROP INDEX IF EXISTS risks_flagged_pi_idx;
