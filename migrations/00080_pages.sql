-- +goose Up

-- ---------------------------------------------------------------------------
-- pages: content-addressable block pages with an immutable revision graph.
-- parent_type/parent_id link to the owning resource (project, iteration,
-- sample, or experiment). project_id is denormalized for fast auth lookups
-- without importing sibling modules.
-- ---------------------------------------------------------------------------
CREATE TABLE pages (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_type         text        NOT NULL
                                    CHECK (parent_type IN ('project','iteration','sample','experiment')),
    parent_id           uuid        NOT NULL,
    current_revision_id uuid        NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pages_parent_idx     ON pages (parent_type, parent_id);
CREATE INDEX pages_project_id_idx ON pages (project_id);

-- ---------------------------------------------------------------------------
-- page_blobs: content-addressable storage — one row per unique blocks JSON.
-- hash is sha256 hex of the canonical (sorted-key) JSON representation.
-- ---------------------------------------------------------------------------
CREATE TABLE page_blobs (
    hash        text    PRIMARY KEY,
    blocks      jsonb   NOT NULL,
    size_bytes  int     NOT NULL
);

-- ---------------------------------------------------------------------------
-- page_revisions: immutable revision records. Each write creates a new row;
-- old current revisions are marked 'superseded'. AI-related fields are inert
-- plumbing in this module.
-- ---------------------------------------------------------------------------
CREATE TABLE page_revisions (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id             uuid        NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    blob_hash           text        NOT NULL REFERENCES page_blobs(hash),
    markdown_export     text        NOT NULL DEFAULT '',
    parent_revision_id  uuid        NULL REFERENCES page_revisions(id),
    source              text        NOT NULL
                                    CHECK (source IN ('human','ai','auto_save','restore','import')),
    status              text        NOT NULL
                                    CHECK (status IN ('current','superseded','candidate','rejected')),
    author              uuid        NULL REFERENCES users(id),
    ai_tool_call_id     uuid        NULL,
    restore_of          uuid        NULL REFERENCES page_revisions(id),
    label               text        NULL,
    retention_class     text        NOT NULL DEFAULT 'keep_forever'
                                    CHECK (retention_class IN ('keep_forever','keep_with_gc')),
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX page_revisions_page_id_idx      ON page_revisions (page_id);
CREATE INDEX page_revisions_page_time_idx    ON page_revisions (page_id, created_at DESC);

-- Add FK from pages to page_revisions now that both tables exist.
ALTER TABLE pages
    ADD CONSTRAINT pages_current_revision_id_fk
    FOREIGN KEY (current_revision_id) REFERENCES page_revisions(id);

-- ---------------------------------------------------------------------------
-- page_presence: ephemeral presence records for collaborative awareness.
-- Stale records (last_heartbeat > 30 s ago) are filtered at query time.
-- ---------------------------------------------------------------------------
CREATE TABLE page_presence (
    page_id         uuid        NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES users(id),
    client_id       text        NOT NULL,
    since           timestamptz NOT NULL DEFAULT now(),
    last_heartbeat  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (page_id, client_id)
);

-- +goose Down
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_current_revision_id_fk;
DROP TABLE IF EXISTS page_presence;
DROP INDEX IF EXISTS page_revisions_page_time_idx;
DROP INDEX IF EXISTS page_revisions_page_id_idx;
DROP TABLE IF EXISTS page_revisions;
DROP TABLE IF EXISTS page_blobs;
DROP INDEX IF EXISTS pages_project_id_idx;
DROP INDEX IF EXISTS pages_parent_idx;
DROP TABLE IF EXISTS pages;
