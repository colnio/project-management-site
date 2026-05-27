// export_test.go exposes internal Service methods for black-box tests in the
// page_test package. This file is compiled only for tests.
package page

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// DiffLine is re-exported so tests can inspect diff output.
type DiffLine = diffLine

// PresenceEntry is re-exported for test assertions.
type PresenceEntry struct {
	UserID        uuid.UUID
	Since         time.Time
	LastHeartbeat time.Time
}

// ExportCreatePage calls the internal createPage method directly.
// slot may be empty string for a legacy/unslotted page.
func ExportCreatePage(
	s *Service,
	ctx context.Context,
	projectID uuid.UUID,
	parentType string,
	parentID uuid.UUID,
	blocks json.RawMessage,
	authorID uuid.UUID,
) (*Page, *Revision, json.RawMessage, error) {
	return s.createPage(ctx, projectID, parentType, parentID, "", blocks, authorID)
}

// ExportUpdatePage performs the If-Match check and calls updatePage.
func ExportUpdatePage(
	s *Service,
	ctx context.Context,
	pg *Page,
	blocks json.RawMessage,
	source string,
	candidate bool,
	authorID uuid.UUID,
	ifMatch string,
) (*Revision, json.RawMessage, error) {
	// If-Match check.
	currentRevStr := ""
	if pg.CurrentRevisionID != nil {
		currentRevStr = pg.CurrentRevisionID.String()
	}
	if !platform.ETagMatches(ifMatch, currentRevStr) {
		currentState := map[string]any{"current_revision_id": currentRevStr}
		return nil, nil, platform.PreconditionFailed(currentState)
	}
	return s.updatePage(ctx, pg, blocks, source, candidate, authorID)
}

// ExportUpdatePageWithPrincipal performs auth + If-Match check + updatePage.
func ExportUpdatePageWithPrincipal(
	s *Service,
	ctx context.Context,
	pg *Page,
	blocks json.RawMessage,
	source string,
	candidate bool,
	p *platform.Principal,
	ifMatch string,
) (*Revision, json.RawMessage, error) {
	// Auth check.
	if _, _, err := s.projects.Authorize(ctx, p, pg.ProjectID, org.RoleEditor); err != nil {
		return nil, nil, err
	}
	currentRevStr := ""
	if pg.CurrentRevisionID != nil {
		currentRevStr = pg.CurrentRevisionID.String()
	}
	if !platform.ETagMatches(ifMatch, currentRevStr) {
		currentState := map[string]any{"current_revision_id": currentRevStr}
		return nil, nil, platform.PreconditionFailed(currentState)
	}
	return s.updatePage(ctx, pg, blocks, source, candidate, p.UserID)
}

// ExportListRevisions returns all revisions for a page (no pagination).
func ExportListRevisions(s *Service, ctx context.Context, pageID uuid.UUID) ([]*Revision, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, page_id, blob_hash, markdown_export, parent_revision_id,
		        source, status, author, label, retention_class, created_at
		 FROM page_revisions WHERE page_id = $1 ORDER BY created_at DESC`,
		pageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var revs []*Revision
	for rows.Next() {
		var rev Revision
		if err := rows.Scan(
			&rev.ID, &rev.PageID, &rev.BlobHash, &rev.MarkdownExport,
			&rev.ParentRevisionID, &rev.Source, &rev.Status,
			&rev.Author, &rev.Label, &rev.RetentionClass, &rev.CreatedAt,
		); err != nil {
			return nil, err
		}
		revs = append(revs, &rev)
	}
	return revs, rows.Err()
}

// ExportRestore calls the internal restore logic via the HTTP handler's service path.
func ExportRestore(s *Service, ctx context.Context, pageID, targetRevID, authorID uuid.UUID) (*Page, *Revision, error) {
	p := &platform.Principal{UserID: authorID}
	pg, rev, err := s.handleRestoreInternal(ctx, p, pageID, targetRevID)
	return pg, rev, err
}

// ExportApproveCandidate promotes a candidate revision to current.
func ExportApproveCandidate(s *Service, ctx context.Context, pageID, candID, actorID uuid.UUID) (*Page, *Revision, error) {
	pg, err := s.GetPage(ctx, pageID)
	if err != nil {
		return nil, nil, err
	}
	cand, err := s.getRevision(ctx, candID)
	if err != nil {
		return nil, nil, err
	}
	if cand.Status != "candidate" {
		return nil, nil, platform.BadRequest("revision.not_candidate", "revision is not a candidate")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if pg.CurrentRevisionID != nil {
		if _, err := tx.Exec(ctx, `UPDATE page_revisions SET status='superseded' WHERE id=$1`, *pg.CurrentRevisionID); err != nil {
			return nil, nil, err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE page_revisions SET status='current' WHERE id=$1`, candID); err != nil {
		return nil, nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE pages SET current_revision_id=$1, updated_at=now() WHERE id=$2`, candID, pageID); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	pg, err = s.GetPage(ctx, pageID)
	if err != nil {
		return nil, nil, err
	}
	cand, err = s.getRevision(ctx, candID)
	if err != nil {
		return nil, nil, err
	}
	return pg, cand, nil
}

// ExportRejectCandidate marks a candidate as rejected.
func ExportRejectCandidate(s *Service, ctx context.Context, pageID, candID, actorID uuid.UUID) (*Revision, error) {
	cand, err := s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}
	if cand.Status != "candidate" {
		return nil, platform.BadRequest("revision.not_candidate", "revision is not a candidate")
	}
	if _, err := s.pool.Exec(ctx, `UPDATE page_revisions SET status='rejected' WHERE id=$1`, candID); err != nil {
		return nil, err
	}
	return s.getRevision(ctx, candID)
}

// ExportDiff returns the diff lines between two revisions.
func ExportDiff(s *Service, ctx context.Context, revID, otherID uuid.UUID) ([]diffLine, error) {
	rev, err := s.getRevision(ctx, revID)
	if err != nil {
		return nil, err
	}
	other, err := s.getRevision(ctx, otherID)
	if err != nil {
		return nil, err
	}
	return lineDiff(rev.MarkdownExport, other.MarkdownExport), nil
}

// ExportListPagesByProject calls the internal listPagesByProject store function.
func ExportListPagesByProject(
	s *Service,
	ctx context.Context,
	projectID uuid.UUID,
	parentType string,
	parentID *uuid.UUID,
) ([]PageListItem, error) {
	return s.listPagesByProject(ctx, projectID, parentType, parentID)
}

// ExportDeriveTitle exposes the title derivation helper for unit tests.
func ExportDeriveTitle(md string) string {
	return deriveTitle(md)
}

// ExportPresenceHeartbeat upserts a presence row.
func ExportPresenceHeartbeat(s *Service, ctx context.Context, pageID, userID uuid.UUID, clientID string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO page_presence (page_id, user_id, client_id, since, last_heartbeat)
		 VALUES ($1, $2, $3, now(), now())
		 ON CONFLICT (page_id, client_id)
		 DO UPDATE SET last_heartbeat = now(), user_id = $2`,
		pageID, userID, clientID,
	)
	return err
}

// ExportPresenceList returns active presence entries.
func ExportPresenceList(s *Service, ctx context.Context, pageID uuid.UUID) ([]PresenceEntry, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT user_id, since, last_heartbeat
		 FROM page_presence
		 WHERE page_id = $1 AND last_heartbeat > now() - interval '30 seconds'
		 ORDER BY since`,
		pageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []PresenceEntry
	for rows.Next() {
		var e PresenceEntry
		if err := rows.Scan(&e.UserID, &e.Since, &e.LastHeartbeat); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
