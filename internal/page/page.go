// Package page implements the Page module (B3): content-addressable block
// pages with an immutable revision graph. Each write creates a new revision
// that references a deduplicated blob (page_blobs). ETags are based on the
// current revision ID to support optimistic concurrency via If-Match.
//
// AI-source revisions are inert plumbing in this module — no LLM calls are
// made here. The ai_tool_call_id / ViaAIConversationID fields are stored and
// returned verbatim.
package page

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// Page is the top-level content container. It holds a pointer to the current
// revision; the actual block data lives in page_blobs via page_revisions.
type Page struct {
	ID                uuid.UUID  `json:"id"`
	ProjectID         uuid.UUID  `json:"project_id"`
	ParentType        string     `json:"parent_type"`
	ParentID          uuid.UUID  `json:"parent_id"`
	CurrentRevisionID *uuid.UUID `json:"current_revision_id,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// Revision is an immutable snapshot of a page's block content at a point in
// time. Status flows: current → superseded (on next write), candidate →
// current (on approve) or rejected (on reject).
type Revision struct {
	ID               uuid.UUID  `json:"id"`
	PageID           uuid.UUID  `json:"page_id"`
	BlobHash         string     `json:"blob_hash"`
	MarkdownExport   string     `json:"markdown_export"`
	ParentRevisionID *uuid.UUID `json:"parent_revision_id,omitempty"`
	Source           string     `json:"source"`
	Status           string     `json:"status"`
	Author           *uuid.UUID `json:"author,omitempty"`
	Label            *string    `json:"label,omitempty"`
	RetentionClass   string     `json:"retention_class"`
	CreatedAt        time.Time  `json:"created_at"`
}

// Service is the page module's domain service. All endpoints call
// projects.Authorize before acting, ensuring callers have the required role.
type Service struct {
	pool     *pgxpool.Pool
	projects *project.Service
	rec      audit.Recorder
	log      *slog.Logger
}

// NewService constructs a Service.
func NewService(
	pool *pgxpool.Pool,
	projects *project.Service,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:     pool,
		projects: projects,
		rec:      rec,
		log:      log,
	}
}

// GetPage loads a page by id. Returns platform.NotFound if absent.
func (s *Service) GetPage(ctx context.Context, id uuid.UUID) (*Page, error) {
	var pg Page
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, parent_type, parent_id,
		        current_revision_id, created_at, updated_at
		 FROM pages WHERE id = $1`,
		id,
	).Scan(
		&pg.ID, &pg.ProjectID, &pg.ParentType, &pg.ParentID,
		&pg.CurrentRevisionID, &pg.CreatedAt, &pg.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("page.not_found", "page not found")
	}
	if err != nil {
		return nil, fmt.Errorf("page: get page: %w", err)
	}
	return &pg, nil
}

// GCAutoSaves deletes old auto_save revisions per page, keeping the newest 20
// for each page. Only rows with retention_class='keep_with_gc' are deleted;
// 'current' and 'keep_forever' revisions are never touched.
//
// Returns the number of rows deleted.
func (s *Service) GCAutoSaves(ctx context.Context) (deleted int, err error) {
	// First NULL out parent_revision_id references that point to rows we are
	// about to delete. This breaks FK cycles in the candidate set and lets us
	// delete in a single statement. We only NULL references from within the same
	// candidate set (other revisions referencing a GC'd row would make no sense
	// semantically — they are also in the GC set).
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("page: gc begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Identify candidates.
	candidateQuery := `
		SELECT id FROM (
		    SELECT id,
		           ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY created_at DESC) AS rn
		    FROM page_revisions
		    WHERE source = 'auto_save'
		      AND retention_class = 'keep_with_gc'
		      AND status != 'current'
		) ranked
		WHERE rn > 20`

	// NULL parent_revision_id for any row in the candidate set whose parent is
	// also in the candidate set.
	_, err = tx.Exec(ctx, `
		UPDATE page_revisions
		SET parent_revision_id = NULL
		WHERE id IN (`+candidateQuery+`)
		  AND parent_revision_id IN (`+candidateQuery+`)
	`)
	if err != nil {
		return 0, fmt.Errorf("page: gc null parents: %w", err)
	}

	// Also NULL parent_revision_id on rows that reference the candidates but are
	// NOT themselves candidates (e.g. a human revision whose parent was an
	// auto_save that got GC'd).
	_, err = tx.Exec(ctx, `
		UPDATE page_revisions
		SET parent_revision_id = NULL
		WHERE parent_revision_id IN (`+candidateQuery+`)
	`)
	if err != nil {
		return 0, fmt.Errorf("page: gc null external parents: %w", err)
	}

	// Now delete the candidates.
	tag, err := tx.Exec(ctx, `
		DELETE FROM page_revisions
		WHERE id IN (`+candidateQuery+`)
	`)
	if err != nil {
		return 0, fmt.Errorf("page: gc delete: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("page: gc commit: %w", err)
	}

	return int(tag.RowsAffected()), nil
}

// ─── Authorization helper ─────────────────────────────────────────────────────

// authPage loads a page and authorises the principal against its project.
func (s *Service) authPage(ctx context.Context, p *platform.Principal, pageID uuid.UUID, need org.Role) (*Page, error) {
	pg, err := s.GetPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	if _, _, err := s.projects.Authorize(ctx, p, pg.ProjectID, need); err != nil {
		return nil, err
	}
	return pg, nil
}

// ─── Blob helpers ─────────────────────────────────────────────────────────────

// canonicalHash returns the sha256 hex of the canonical JSON representation of
// blocks (deterministic: keys sorted at every object level recursively).
func canonicalHash(blocks json.RawMessage) (string, []byte, error) {
	var v any
	if err := json.Unmarshal(blocks, &v); err != nil {
		return "", nil, fmt.Errorf("page: unmarshal blocks: %w", err)
	}
	canon, err := marshalSorted(v)
	if err != nil {
		return "", nil, fmt.Errorf("page: canonical marshal: %w", err)
	}
	sum := sha256.Sum256(canon)
	return fmt.Sprintf("%x", sum), canon, nil
}

// marshalSorted serialises v to JSON with object keys sorted recursively.
func marshalSorted(v any) ([]byte, error) {
	switch val := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		buf := []byte{'{'}
		for i, k := range keys {
			kj, err := json.Marshal(k)
			if err != nil {
				return nil, err
			}
			vj, err := marshalSorted(val[k])
			if err != nil {
				return nil, err
			}
			if i > 0 {
				buf = append(buf, ',')
			}
			buf = append(buf, kj...)
			buf = append(buf, ':')
			buf = append(buf, vj...)
		}
		buf = append(buf, '}')
		return buf, nil

	case []any:
		buf := []byte{'['}
		for i, elem := range val {
			ej, err := marshalSorted(elem)
			if err != nil {
				return nil, err
			}
			if i > 0 {
				buf = append(buf, ',')
			}
			buf = append(buf, ej...)
		}
		buf = append(buf, ']')
		return buf, nil

	default:
		return json.Marshal(v)
	}
}

// upsertBlob inserts a blob row if one with the same hash doesn't exist yet.
func (s *Service) upsertBlob(ctx context.Context, hash string, canon []byte) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO page_blobs (hash, blocks, size_bytes)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (hash) DO NOTHING`,
		hash, json.RawMessage(canon), len(canon),
	)
	return err
}

// markdownFromBlocks builds a simple plaintext rendering of a blocks array
// by concatenating the "text" fields found anywhere in the top-level block
// objects. This is a best-effort v1 renderer for FTS seeding.
func markdownFromBlocks(blocks json.RawMessage) string {
	var items []any
	if err := json.Unmarshal(blocks, &items); err != nil {
		return ""
	}
	var parts []string
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if t, ok := m["text"].(string); ok && t != "" {
			parts = append(parts, t)
		}
		// Also check nested content array.
		if content, ok := m["content"].([]any); ok {
			for _, c := range content {
				cm, ok := c.(map[string]any)
				if !ok {
					continue
				}
				if t, ok := cm["text"].(string); ok && t != "" {
					parts = append(parts, t)
				}
			}
		}
	}
	return strings.Join(parts, "\n")
}

// ─── Page creation ────────────────────────────────────────────────────────────

// createPage inserts the page row and its first revision. Called by the HTTP
// handler after auth.
func (s *Service) createPage(
	ctx context.Context,
	projectID uuid.UUID,
	parentType string,
	parentID uuid.UUID,
	blocks json.RawMessage,
	authorID uuid.UUID,
) (*Page, *Revision, json.RawMessage, error) {
	hash, canon, err := canonicalHash(blocks)
	if err != nil {
		return nil, nil, nil, platform.BadRequest("page.invalid_blocks", err.Error())
	}
	if err := s.upsertBlob(ctx, hash, canon); err != nil {
		return nil, nil, nil, fmt.Errorf("page: upsert blob: %w", err)
	}

	md := markdownFromBlocks(blocks)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("page: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Insert page (current_revision_id NULL initially to avoid circular FK).
	var pg Page
	err = tx.QueryRow(ctx,
		`INSERT INTO pages (project_id, parent_type, parent_id)
		 VALUES ($1, $2, $3)
		 RETURNING id, project_id, parent_type, parent_id,
		           current_revision_id, created_at, updated_at`,
		projectID, parentType, parentID,
	).Scan(
		&pg.ID, &pg.ProjectID, &pg.ParentType, &pg.ParentID,
		&pg.CurrentRevisionID, &pg.CreatedAt, &pg.UpdatedAt,
	)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("page: insert page: %w", err)
	}

	// Insert initial revision.
	var rev Revision
	err = tx.QueryRow(ctx,
		`INSERT INTO page_revisions
		    (page_id, blob_hash, markdown_export, source, status, author, retention_class)
		 VALUES ($1, $2, $3, 'human', 'current', $4, 'keep_forever')
		 RETURNING id, page_id, blob_hash, markdown_export, parent_revision_id,
		           source, status, author, label, retention_class, created_at`,
		pg.ID, hash, md, authorID,
	).Scan(
		&rev.ID, &rev.PageID, &rev.BlobHash, &rev.MarkdownExport,
		&rev.ParentRevisionID, &rev.Source, &rev.Status,
		&rev.Author, &rev.Label, &rev.RetentionClass, &rev.CreatedAt,
	)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("page: insert initial revision: %w", err)
	}

	// Update page to point to the new revision.
	_, err = tx.Exec(ctx,
		`UPDATE pages SET current_revision_id = $1, updated_at = now() WHERE id = $2`,
		rev.ID, pg.ID,
	)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("page: update current_revision_id: %w", err)
	}
	pg.CurrentRevisionID = &rev.ID

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, nil, fmt.Errorf("page: commit create: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        authorID,
		Action:       "page.create",
		ResourceType: "page",
		ResourceID:   pg.ID.String(),
	})

	return &pg, &rev, json.RawMessage(canon), nil
}

// ─── Page update ──────────────────────────────────────────────────────────────

// updatePage creates a new revision for the page, superseding the current one.
// If candidate is true the revision is inserted with status='candidate' and the
// page's current_revision_id is NOT changed (non-destructive).
func (s *Service) updatePage(
	ctx context.Context,
	pg *Page,
	blocks json.RawMessage,
	source string,
	candidate bool,
	authorID uuid.UUID,
) (*Revision, json.RawMessage, error) {
	hash, canon, err := canonicalHash(blocks)
	if err != nil {
		return nil, nil, platform.BadRequest("page.invalid_blocks", err.Error())
	}
	if err := s.upsertBlob(ctx, hash, canon); err != nil {
		return nil, nil, fmt.Errorf("page: upsert blob: %w", err)
	}

	md := markdownFromBlocks(blocks)

	retentionClass := "keep_forever"
	if source == "auto_save" {
		retentionClass = "keep_with_gc"
	}

	var newStatus string
	if candidate {
		newStatus = "candidate"
	} else {
		newStatus = "current"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("page: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	oldRevID := pg.CurrentRevisionID

	// Insert the new revision.
	var rev Revision
	err = tx.QueryRow(ctx,
		`INSERT INTO page_revisions
		    (page_id, blob_hash, markdown_export, parent_revision_id,
		     source, status, author, retention_class)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, page_id, blob_hash, markdown_export, parent_revision_id,
		           source, status, author, label, retention_class, created_at`,
		pg.ID, hash, md, oldRevID,
		source, newStatus, authorID, retentionClass,
	).Scan(
		&rev.ID, &rev.PageID, &rev.BlobHash, &rev.MarkdownExport,
		&rev.ParentRevisionID, &rev.Source, &rev.Status,
		&rev.Author, &rev.Label, &rev.RetentionClass, &rev.CreatedAt,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("page: insert revision: %w", err)
	}

	if !candidate {
		// Supersede the old current revision.
		if oldRevID != nil {
			_, err = tx.Exec(ctx,
				`UPDATE page_revisions SET status = 'superseded' WHERE id = $1`,
				*oldRevID,
			)
			if err != nil {
				return nil, nil, fmt.Errorf("page: supersede old revision: %w", err)
			}
		}

		// Advance the page pointer.
		_, err = tx.Exec(ctx,
			`UPDATE pages SET current_revision_id = $1, updated_at = now() WHERE id = $2`,
			rev.ID, pg.ID,
		)
		if err != nil {
			return nil, nil, fmt.Errorf("page: update current_revision_id: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, fmt.Errorf("page: commit update: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        authorID,
		Action:       "page.update",
		ResourceType: "page",
		ResourceID:   pg.ID.String(),
	})

	return &rev, json.RawMessage(canon), nil
}

// ─── Restore helper ───────────────────────────────────────────────────────────

// handleRestoreInternal performs the non-destructive restore: creates a new
// revision (source='restore') from targetRevID's blob and makes it current.
func (s *Service) handleRestoreInternal(ctx context.Context, p *platform.Principal, pageID, targetRevID uuid.UUID) (*Page, *Revision, error) {
	pg, err := s.GetPage(ctx, pageID)
	if err != nil {
		return nil, nil, err
	}

	targetRev, err := s.getRevision(ctx, targetRevID)
	if err != nil {
		return nil, nil, err
	}
	if targetRev.PageID != pageID {
		return nil, nil, platform.BadRequest("revision.wrong_page", "revision belongs to a different page")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("page: restore begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	oldRevID := pg.CurrentRevisionID
	var rev Revision
	err = tx.QueryRow(ctx,
		`INSERT INTO page_revisions
		    (page_id, blob_hash, markdown_export, parent_revision_id,
		     source, status, author, restore_of, retention_class)
		 VALUES ($1, $2, $3, $4, 'restore', 'current', $5, $6, 'keep_forever')
		 RETURNING id, page_id, blob_hash, markdown_export, parent_revision_id,
		           source, status, author, label, retention_class, created_at`,
		pageID, targetRev.BlobHash, targetRev.MarkdownExport, oldRevID,
		p.UserID, targetRevID,
	).Scan(
		&rev.ID, &rev.PageID, &rev.BlobHash, &rev.MarkdownExport,
		&rev.ParentRevisionID, &rev.Source, &rev.Status,
		&rev.Author, &rev.Label, &rev.RetentionClass, &rev.CreatedAt,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("page: restore insert: %w", err)
	}

	if oldRevID != nil {
		if _, err := tx.Exec(ctx,
			`UPDATE page_revisions SET status='superseded' WHERE id=$1`, *oldRevID,
		); err != nil {
			return nil, nil, fmt.Errorf("page: restore supersede: %w", err)
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE pages SET current_revision_id=$1, updated_at=now() WHERE id=$2`,
		rev.ID, pageID,
	); err != nil {
		return nil, nil, fmt.Errorf("page: restore update page: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, fmt.Errorf("page: restore commit: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "page.restore",
		ResourceType: "page",
		ResourceID:   pageID.String(),
	})

	pg, err = s.GetPage(ctx, pageID)
	if err != nil {
		return nil, nil, err
	}
	return pg, &rev, nil
}

// ─── List pages ───────────────────────────────────────────────────────────────

// PageListItem is a lightweight summary of a page, including a derived title
// from the current revision's markdown_export.
type PageListItem struct {
	ID                uuid.UUID  `json:"id"`
	ProjectID         uuid.UUID  `json:"project_id"`
	ParentType        string     `json:"parent_type"`
	ParentID          uuid.UUID  `json:"parent_id"`
	CurrentRevisionID *uuid.UUID `json:"current_revision_id,omitempty"`
	Title             string     `json:"title"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// deriveTitle extracts a human-readable title from a markdown_export string.
// It uses the first non-empty line, strips a leading '#' sequence and spaces,
// trims surrounding whitespace, and falls back to "Untitled". Capped at 120 chars.
func deriveTitle(md string) string {
	for _, line := range strings.Split(md, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Strip leading '#' characters (heading markers).
		line = strings.TrimLeft(line, "#")
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len(line) > 120 {
			line = line[:120]
		}
		return line
	}
	return "Untitled"
}

// listPagesByProject returns PageListItems for a project, optionally filtered
// by parentType and parentID, ordered by updated_at DESC.
func (s *Service) listPagesByProject(
	ctx context.Context,
	projectID uuid.UUID,
	parentType string,
	parentID *uuid.UUID,
) ([]PageListItem, error) {
	// Build query dynamically based on optional filters.
	args := []any{projectID}
	where := `WHERE p.project_id = $1`

	if parentType != "" {
		args = append(args, parentType)
		where += fmt.Sprintf(` AND p.parent_type = $%d`, len(args))
	}
	if parentID != nil {
		args = append(args, *parentID)
		where += fmt.Sprintf(` AND p.parent_id = $%d`, len(args))
	}

	q := `SELECT p.id, p.project_id, p.parent_type, p.parent_id,
	             p.current_revision_id, p.updated_at,
	             COALESCE(r.markdown_export, '')
	      FROM pages p
	      LEFT JOIN page_revisions r ON r.id = p.current_revision_id
	      ` + where + `
	      ORDER BY p.updated_at DESC`

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("page: list pages: %w", err)
	}
	defer rows.Close()

	var items []PageListItem
	for rows.Next() {
		var item PageListItem
		var md string
		if err := rows.Scan(
			&item.ID, &item.ProjectID, &item.ParentType, &item.ParentID,
			&item.CurrentRevisionID, &item.UpdatedAt, &md,
		); err != nil {
			return nil, fmt.Errorf("page: list pages scan: %w", err)
		}
		item.Title = deriveTitle(md)
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("page: list pages rows: %w", rows.Err())
	}
	if items == nil {
		items = []PageListItem{}
	}
	return items, nil
}

// ─── Revision helpers ─────────────────────────────────────────────────────────

// getRevision loads a single revision by id.
func (s *Service) getRevision(ctx context.Context, id uuid.UUID) (*Revision, error) {
	var rev Revision
	err := s.pool.QueryRow(ctx,
		`SELECT id, page_id, blob_hash, markdown_export, parent_revision_id,
		        source, status, author, label, retention_class, created_at
		 FROM page_revisions WHERE id = $1`,
		id,
	).Scan(
		&rev.ID, &rev.PageID, &rev.BlobHash, &rev.MarkdownExport,
		&rev.ParentRevisionID, &rev.Source, &rev.Status,
		&rev.Author, &rev.Label, &rev.RetentionClass, &rev.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("revision.not_found", "revision not found")
	}
	if err != nil {
		return nil, fmt.Errorf("page: get revision: %w", err)
	}
	return &rev, nil
}

// getBlob loads the canonical blocks JSON for a blob hash.
func (s *Service) getBlob(ctx context.Context, hash string) (json.RawMessage, error) {
	var blocks json.RawMessage
	err := s.pool.QueryRow(ctx,
		`SELECT blocks FROM page_blobs WHERE hash = $1`, hash,
	).Scan(&blocks)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("blob.not_found", "blob not found")
	}
	if err != nil {
		return nil, fmt.Errorf("page: get blob: %w", err)
	}
	return blocks, nil
}
