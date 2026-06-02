package page

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// ─── List revisions ───────────────────────────────────────────────────────────

type listRevisionsInput struct {
	ID     string `path:"id"`
	Before string `query:"before"` // cursor: revision ID
	Limit  int    `query:"limit"`
}

type listRevisionsOutput struct {
	Body struct {
		Revisions  []*Revision `json:"revisions"`
		NextCursor string      `json:"next_cursor,omitempty"`
	}
}

func (s *Service) handleListRevisions(ctx context.Context, in *listRevisionsInput) (*listRevisionsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadPages); err != nil {
		return nil, err
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	if _, err := s.authPage(ctx, p, pageID, org.RoleViewer); err != nil {
		return nil, err
	}

	limit := in.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	out := &listRevisionsOutput{}
	var revs []*Revision

	if in.Before != "" {
		cursorID, err := uuid.Parse(in.Before)
		if err != nil {
			return nil, platform.BadRequest("page.invalid_cursor", "invalid cursor")
		}
		var cursorTime time.Time
		err = s.pool.QueryRow(ctx,
			`SELECT created_at FROM page_revisions WHERE id = $1 AND page_id = $2`,
			cursorID, pageID,
		).Scan(&cursorTime)
		if err != nil {
			return nil, platform.BadRequest("page.invalid_cursor", "cursor revision not found")
		}

		pgxRows, err := s.pool.Query(ctx,
			`SELECT id, page_id, blob_hash, markdown_export, parent_revision_id,
			        source, status, author, label, retention_class, created_at
			 FROM page_revisions
			 WHERE page_id = $1
			   AND (created_at < $2 OR (created_at = $2 AND id < $3))
			 ORDER BY created_at DESC, id DESC
			 LIMIT $4`,
			pageID, cursorTime, cursorID, limit+1,
		)
		if err != nil {
			return nil, err
		}
		defer pgxRows.Close()
		for pgxRows.Next() {
			var rev Revision
			if err := pgxRows.Scan(
				&rev.ID, &rev.PageID, &rev.BlobHash, &rev.MarkdownExport,
				&rev.ParentRevisionID, &rev.Source, &rev.Status,
				&rev.Author, &rev.Label, &rev.RetentionClass, &rev.CreatedAt,
			); err != nil {
				return nil, err
			}
			revs = append(revs, &rev)
		}
		if pgxRows.Err() != nil {
			return nil, pgxRows.Err()
		}
	} else {
		pgxRows, err := s.pool.Query(ctx,
			`SELECT id, page_id, blob_hash, markdown_export, parent_revision_id,
			        source, status, author, label, retention_class, created_at
			 FROM page_revisions
			 WHERE page_id = $1
			 ORDER BY created_at DESC, id DESC
			 LIMIT $2`,
			pageID, limit+1,
		)
		if err != nil {
			return nil, err
		}
		defer pgxRows.Close()
		for pgxRows.Next() {
			var rev Revision
			if err := pgxRows.Scan(
				&rev.ID, &rev.PageID, &rev.BlobHash, &rev.MarkdownExport,
				&rev.ParentRevisionID, &rev.Source, &rev.Status,
				&rev.Author, &rev.Label, &rev.RetentionClass, &rev.CreatedAt,
			); err != nil {
				return nil, err
			}
			revs = append(revs, &rev)
		}
		if pgxRows.Err() != nil {
			return nil, pgxRows.Err()
		}
	}

	if len(revs) > limit {
		out.Body.NextCursor = revs[limit].ID.String()
		revs = revs[:limit]
	}
	if revs == nil {
		revs = []*Revision{}
	}
	out.Body.Revisions = revs
	return out, nil
}

// ─── Get revision ─────────────────────────────────────────────────────────────

type getRevisionInput struct {
	ID string `path:"id"`
}

type getRevisionOutput struct {
	Body struct {
		Revision *Revision       `json:"revision"`
		Blocks   json.RawMessage `json:"blocks"`
	}
}

func (s *Service) handleGetRevision(ctx context.Context, in *getRevisionInput) (*getRevisionOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadPages); err != nil {
		return nil, err
	}

	revID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_id", "invalid revision ID")
	}

	rev, err := s.getRevision(ctx, revID)
	if err != nil {
		return nil, err
	}

	// Auth via the revision's page → project.
	if _, err := s.authPage(ctx, p, rev.PageID, org.RoleViewer); err != nil {
		return nil, err
	}

	blocks, err := s.getBlob(ctx, rev.BlobHash)
	if err != nil {
		return nil, err
	}

	out := &getRevisionOutput{}
	out.Body.Revision = rev
	out.Body.Blocks = blocks
	return out, nil
}

// ─── Diff revisions ───────────────────────────────────────────────────────────

type diffRevisionsInput struct {
	ID      string `path:"id"`
	Against string `query:"against" required:"true"`
}

type diffLine struct {
	Op   string `json:"op"`
	Text string `json:"text"`
}

type diffRevisionsOutput struct {
	Body struct {
		Lines []diffLine `json:"lines"`
	}
}

func (s *Service) handleDiffRevisions(ctx context.Context, in *diffRevisionsInput) (*diffRevisionsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadPages); err != nil {
		return nil, err
	}

	revID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_id", "invalid revision ID")
	}

	otherID, err := uuid.Parse(in.Against)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_against", "invalid against revision ID")
	}

	rev, err := s.getRevision(ctx, revID)
	if err != nil {
		return nil, err
	}
	other, err := s.getRevision(ctx, otherID)
	if err != nil {
		return nil, err
	}

	if rev.PageID != other.PageID {
		return nil, platform.BadRequest("revision.different_page", "revisions belong to different pages")
	}

	// Auth via the common page.
	if _, err := s.authPage(ctx, p, rev.PageID, org.RoleViewer); err != nil {
		return nil, err
	}

	lines := lineDiff(rev.MarkdownExport, other.MarkdownExport)
	out := &diffRevisionsOutput{}
	out.Body.Lines = lines
	return out, nil
}

// lineDiff produces a simple line-based diff (LCS-backed) between a and b.
// Returns +/- / (equal) operations from a's perspective relative to b.
func lineDiff(a, b string) []diffLine {
	aLines := splitLines(a)
	bLines := splitLines(b)

	// Build LCS table.
	m, n := len(aLines), len(bLines)
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := m - 1; i >= 0; i-- {
		for j := n - 1; j >= 0; j-- {
			if aLines[i] == bLines[j] {
				dp[i][j] = 1 + dp[i+1][j+1]
			} else if dp[i+1][j] > dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}

	// Trace back.
	var result []diffLine
	i, j := 0, 0
	for i < m && j < n {
		if aLines[i] == bLines[j] {
			result = append(result, diffLine{Op: " ", Text: aLines[i]})
			i++
			j++
		} else if dp[i+1][j] >= dp[i][j+1] {
			result = append(result, diffLine{Op: "-", Text: aLines[i]})
			i++
		} else {
			result = append(result, diffLine{Op: "+", Text: bLines[j]})
			j++
		}
	}
	for ; i < m; i++ {
		result = append(result, diffLine{Op: "-", Text: aLines[i]})
	}
	for ; j < n; j++ {
		result = append(result, diffLine{Op: "+", Text: bLines[j]})
	}
	if result == nil {
		result = []diffLine{}
	}
	return result
}

func splitLines(s string) []string {
	if s == "" {
		return []string{}
	}
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	lines = append(lines, s[start:])
	return lines
}
