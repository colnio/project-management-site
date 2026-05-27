-- +goose Up
-- Add 'kickoff' to the allowed meeting kinds (the API enum already offers it).
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_kind_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_kind_check
    CHECK (kind IN ('sync','review','planning','retro','kickoff','other'));

-- +goose Down
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_kind_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_kind_check
    CHECK (kind IN ('sync','review','planning','retro','other'));
