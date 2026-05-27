package page

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires page HTTP endpoints onto the huma API.
//
// Content-addressable model: every write upserts into page_blobs (hash →
// blocks) and inserts an immutable page_revisions row. The page's
// current_revision_id advances on non-candidate writes. Concurrent writers
// must send If-Match (ETag from GET); a mismatch returns 412.
//
// Candidate revisions: PUT /v1/pages/{id}?candidate=true (or "candidate":true
// in the body) inserts a revision with status="candidate" WITHOUT advancing
// current_revision_id. Use POST .../candidates/{id}/approve to promote or
// .../candidates/{id}/reject to close.
func Register(api huma.API, svc *Service) {
	// Pages under a project.
	huma.Register(api, huma.Operation{
		OperationID: "page-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/pages",
		Summary:     "List pages for a project",
		Description: "Returns a list of page summaries (including derived title) for a project. Optionally filter by `parent_type` and `parent_id`. Results are ordered by updated_at descending. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleListPages)

	huma.Register(api, huma.Operation{
		OperationID: "page-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/pages",
		Summary:     "Create a page",
		Description: "Creates a new content-addressable page attached to a parent entity (project, iteration, sample, or experiment). Returns the page and its initial blocks along with an ETag. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleCreatePage)

	// Single page.
	huma.Register(api, huma.Operation{
		OperationID: "page-get",
		Method:      http.MethodGet,
		Path:        "/v1/pages/{id}",
		Summary:     "Get a page with current blocks",
		Description: "Returns the page metadata, the current revision's blocks (JSON array), and a markdown export. The ETag in the response must be sent as `If-Match` on subsequent writes. Requires viewer role on the page's project.",
		Tags:        []string{"pages"},
	}, svc.handleGetPage)

	huma.Register(api, huma.Operation{
		OperationID: "page-update",
		Method:      http.MethodPut,
		Path:        "/v1/pages/{id}",
		Summary:     "Update page blocks (requires If-Match)",
		Description: "Writes a new revision for the page. Send the ETag from a prior GET as the `If-Match` header; a mismatch returns 412. Set `candidate=true` to stage an AI-generated draft for approval instead of advancing the current revision. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleUpdatePage)

	// Revisions.
	huma.Register(api, huma.Operation{
		OperationID: "page-revisions-list",
		Method:      http.MethodGet,
		Path:        "/v1/pages/{id}/revisions",
		Summary:     "List page revisions (newest-first)",
		Description: "Returns a cursor-paginated list of revisions for a page, newest first. Pass `before=<revision_id>` and `limit` (default 50, max 100) to paginate. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleListRevisions)

	huma.Register(api, huma.Operation{
		OperationID: "revision-get",
		Method:      http.MethodGet,
		Path:        "/v1/revisions/{id}",
		Summary:     "Get a revision with full content",
		Description: "Returns a specific revision including its content blocks and markdown export. Requires viewer role on the revision's page's project.",
		Tags:        []string{"pages"},
	}, svc.handleGetRevision)

	huma.Register(api, huma.Operation{
		OperationID: "revision-diff",
		Method:      http.MethodGet,
		Path:        "/v1/revisions/{id}/diff",
		Summary:     "Line diff between two revisions' markdown exports",
		Description: "Returns a line-based LCS diff between the markdown exports of two revisions on the same page. Pass the other revision's ID as `against`. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleDiffRevisions)

	// Restore.
	huma.Register(api, huma.Operation{
		OperationID: "page-restore",
		Method:      http.MethodPost,
		Path:        "/v1/pages/{id}/restore",
		Summary:     "Restore a page to a previous revision",
		Description: "Creates a new revision whose content matches a previous one, advancing `current_revision_id` to the restored snapshot. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleRestore)

	// Candidates.
	huma.Register(api, huma.Operation{
		OperationID: "page-candidate-approve",
		Method:      http.MethodPost,
		Path:        "/v1/pages/{id}/candidates/{cand_id}/approve",
		Summary:     "Approve a candidate revision",
		Description: "Promotes a candidate revision to the current revision, superseding the previous current. Used in the AI-assisted editing workflow. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleApproveCandidate)

	huma.Register(api, huma.Operation{
		OperationID: "page-candidate-reject",
		Method:      http.MethodPost,
		Path:        "/v1/pages/{id}/candidates/{cand_id}/reject",
		Summary:     "Reject a candidate revision",
		Description: "Marks a candidate revision as rejected without changing the current revision. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleRejectCandidate)

	// Presence.
	huma.Register(api, huma.Operation{
		OperationID: "page-presence-heartbeat",
		Method:      http.MethodPost,
		Path:        "/v1/pages/{id}/presence/heartbeat",
		Summary:     "Update presence heartbeat",
		Description: "Records or refreshes a client's active editing presence for a page. Presence entries expire after 30 seconds without a heartbeat. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handlePresenceHeartbeat)

	huma.Register(api, huma.Operation{
		OperationID: "page-presence-list",
		Method:      http.MethodGet,
		Path:        "/v1/pages/{id}/presence",
		Summary:     "List active page presence (within 30 s)",
		Description: "Returns users who have sent a heartbeat for this page in the last 30 seconds, useful for showing concurrent editors. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handlePresenceList)
}

// ─── List pages ───────────────────────────────────────────────────────────────

type listPagesInput struct {
	ID         string `path:"id"`
	ParentType string `query:"parent_type" enum:"project,iteration,sample,experiment"`
	ParentID   string `query:"parent_id"`
}

type listPagesOutput struct {
	Body struct {
		Items []PageListItem `json:"items"`
	}
}

func (s *Service) handleListPages(ctx context.Context, in *listPagesInput) (*listPagesOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	var parentID *uuid.UUID
	if in.ParentID != "" {
		parsed, err := uuid.Parse(in.ParentID)
		if err != nil {
			return nil, platform.BadRequest("page.invalid_parent_id", "invalid parent_id")
		}
		parentID = &parsed
	}

	items, err := s.listPagesByProject(ctx, projectID, in.ParentType, parentID)
	if err != nil {
		return nil, err
	}

	out := &listPagesOutput{}
	out.Body.Items = items
	return out, nil
}

// ─── Create page ──────────────────────────────────────────────────────────────

type createPageInput struct {
	ID   string `path:"id"`
	Body struct {
		ParentType string          `json:"parent_type" required:"true" enum:"project,iteration,sample,experiment"`
		ParentID   string          `json:"parent_id" required:"true"`
		Blocks     json.RawMessage `json:"blocks" required:"true"`
	}
}

type createPageOutput struct {
	Status int
	ETag   string `header:"ETag"`
	Body   struct {
		Page   *Page           `json:"page"`
		Blocks json.RawMessage `json:"blocks"`
	}
}

func (s *Service) handleCreatePage(ctx context.Context, in *createPageInput) (*createPageOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	parentID, err := uuid.Parse(in.Body.ParentID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_parent_id", "invalid parent_id")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if len(in.Body.Blocks) == 0 {
		return nil, platform.BadRequest("page.invalid_blocks", "blocks must be a JSON array")
	}
	// Validate it's an array.
	if in.Body.Blocks[0] != '[' {
		return nil, platform.BadRequest("page.invalid_blocks", "blocks must be a JSON array")
	}

	pg, _, blocks, err := s.createPage(ctx, projectID, in.Body.ParentType, parentID, in.Body.Blocks, p.UserID)
	if err != nil {
		return nil, err
	}

	out := &createPageOutput{Status: http.StatusCreated}
	out.ETag = platform.FormatETag(pg.CurrentRevisionID.String())
	out.Body.Page = pg
	out.Body.Blocks = blocks
	return out, nil
}

// ─── Get page ─────────────────────────────────────────────────────────────────

type getPageInput struct {
	ID string `path:"id"`
}

type getPageOutput struct {
	ETag string `header:"ETag"`
	Body struct {
		ID                uuid.UUID       `json:"id"`
		ProjectID         uuid.UUID       `json:"project_id"`
		ParentType        string          `json:"parent_type"`
		ParentID          uuid.UUID       `json:"parent_id"`
		Blocks            json.RawMessage `json:"blocks"`
		MarkdownExport    string          `json:"markdown_export"`
		CurrentRevisionID *uuid.UUID      `json:"current_revision_id,omitempty"`
	}
}

func (s *Service) handleGetPage(ctx context.Context, in *getPageInput) (*getPageOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	pg, err := s.authPage(ctx, p, pageID, org.RoleViewer)
	if err != nil {
		return nil, err
	}

	out := &getPageOutput{}
	out.Body.ID = pg.ID
	out.Body.ProjectID = pg.ProjectID
	out.Body.ParentType = pg.ParentType
	out.Body.ParentID = pg.ParentID
	out.Body.CurrentRevisionID = pg.CurrentRevisionID

	if pg.CurrentRevisionID != nil {
		rev, err := s.getRevision(ctx, *pg.CurrentRevisionID)
		if err != nil {
			return nil, err
		}
		blocks, err := s.getBlob(ctx, rev.BlobHash)
		if err != nil {
			return nil, err
		}
		out.Body.Blocks = blocks
		out.Body.MarkdownExport = rev.MarkdownExport
		out.ETag = platform.FormatETag(pg.CurrentRevisionID.String())
	}

	return out, nil
}

// ─── Update page ──────────────────────────────────────────────────────────────

type updatePageInput struct {
	ID      string `path:"id"`
	IfMatch string `header:"If-Match"`
	Body    struct {
		Blocks    json.RawMessage `json:"blocks" required:"true"`
		Source    string          `json:"source,omitempty" enum:"human,auto_save"`
		Candidate bool            `json:"candidate,omitempty"`
	}
}

type updatePageOutput struct {
	ETag string `header:"ETag"`
	Body struct {
		Page     *Page           `json:"page"`
		Revision *Revision       `json:"revision"`
		Blocks   json.RawMessage `json:"blocks"`
	}
}

func (s *Service) handleUpdatePage(ctx context.Context, in *updatePageInput) (*updatePageOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	pg, err := s.authPage(ctx, p, pageID, org.RoleEditor)
	if err != nil {
		return nil, err
	}

	// Validate blocks.
	if len(in.Body.Blocks) == 0 || in.Body.Blocks[0] != '[' {
		return nil, platform.BadRequest("page.invalid_blocks", "blocks must be a JSON array")
	}

	// ETag / If-Match check.
	currentRevStr := ""
	if pg.CurrentRevisionID != nil {
		currentRevStr = pg.CurrentRevisionID.String()
	}
	if !platform.ETagMatches(in.IfMatch, currentRevStr) {
		// Load current state for the 412 body.
		currentState := map[string]any{"current_revision_id": currentRevStr}
		return nil, platform.PreconditionFailed(currentState)
	}

	source := in.Body.Source
	if source == "" {
		source = "human"
	}

	rev, blocks, err := s.updatePage(ctx, pg, in.Body.Blocks, source, in.Body.Candidate, p.UserID)
	if err != nil {
		return nil, err
	}

	// Reload page to get updated current_revision_id.
	pg, err = s.GetPage(ctx, pageID)
	if err != nil {
		return nil, err
	}

	out := &updatePageOutput{}
	if pg.CurrentRevisionID != nil {
		out.ETag = platform.FormatETag(pg.CurrentRevisionID.String())
	} else {
		out.ETag = platform.FormatETag(rev.ID.String())
	}
	out.Body.Page = pg
	out.Body.Revision = rev
	out.Body.Blocks = blocks
	return out, nil
}

// ─── List revisions ───────────────────────────────────────────────────────────

type listRevisionsInput struct {
	ID     string `path:"id"`
	Before string `query:"before"` // cursor: revision ID
	Limit  int    `query:"limit"`
}

type listRevisionsOutput struct {
	Body struct {
		Revisions []*Revision `json:"revisions"`
		NextCursor string     `json:"next_cursor,omitempty"`
	}
}

func (s *Service) handleListRevisions(ctx context.Context, in *listRevisionsInput) (*listRevisionsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
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
			`SELECT created_at FROM page_revisions WHERE id = $1`, cursorID,
		).Scan(&cursorTime)
		if err != nil {
			return nil, platform.BadRequest("page.invalid_cursor", "cursor revision not found")
		}

		pgxRows, err := s.pool.Query(ctx,
			`SELECT id, page_id, blob_hash, markdown_export, parent_revision_id,
			        source, status, author, label, retention_class, created_at
			 FROM page_revisions
			 WHERE page_id = $1 AND created_at < $2
			 ORDER BY created_at DESC
			 LIMIT $3`,
			pageID, cursorTime, limit+1,
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
			 ORDER BY created_at DESC
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

// ─── Restore ──────────────────────────────────────────────────────────────────

type restoreInput struct {
	ID   string `path:"id"`
	Body struct {
		RevisionID string `json:"revision_id" required:"true"`
	}
}

type restoreOutput struct {
	ETag string `header:"ETag"`
	Body struct {
		Page     *Page     `json:"page"`
		Revision *Revision `json:"revision"`
	}
}

func (s *Service) handleRestore(ctx context.Context, in *restoreInput) (*restoreOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	targetRevID, err := uuid.Parse(in.Body.RevisionID)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_id", "invalid revision_id")
	}

	// Auth: requires editor.
	if _, err := s.authPage(ctx, p, pageID, org.RoleEditor); err != nil {
		return nil, err
	}

	pg, rev, err := s.handleRestoreInternal(ctx, p, pageID, targetRevID)
	if err != nil {
		return nil, err
	}

	out := &restoreOutput{}
	out.ETag = platform.FormatETag(rev.ID.String())
	out.Body.Page = pg
	out.Body.Revision = rev
	return out, nil
}

// ─── Candidate approve ────────────────────────────────────────────────────────

type approveCandidateInput struct {
	ID     string `path:"id"`
	CandID string `path:"cand_id"`
}

type approveCandidateOutput struct {
	ETag string `header:"ETag"`
	Body struct {
		Page     *Page     `json:"page"`
		Revision *Revision `json:"revision"`
	}
}

func (s *Service) handleApproveCandidate(ctx context.Context, in *approveCandidateInput) (*approveCandidateOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	candID, err := uuid.Parse(in.CandID)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_id", "invalid candidate revision ID")
	}

	pg, err := s.authPage(ctx, p, pageID, org.RoleEditor)
	if err != nil {
		return nil, err
	}

	cand, err := s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}
	if cand.PageID != pageID {
		return nil, platform.BadRequest("revision.wrong_page", "candidate belongs to a different page")
	}
	if cand.Status != "candidate" {
		return nil, platform.BadRequest("revision.not_candidate", "revision is not a candidate")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Supersede current.
	if pg.CurrentRevisionID != nil {
		if _, err := tx.Exec(ctx,
			`UPDATE page_revisions SET status='superseded' WHERE id=$1`, *pg.CurrentRevisionID,
		); err != nil {
			return nil, err
		}
	}

	// Promote candidate.
	if _, err := tx.Exec(ctx,
		`UPDATE page_revisions SET status='current' WHERE id=$1`, candID,
	); err != nil {
		return nil, err
	}

	// Advance page pointer.
	if _, err := tx.Exec(ctx,
		`UPDATE pages SET current_revision_id=$1, updated_at=now() WHERE id=$2`,
		candID, pageID,
	); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "page.candidate_approve",
		ResourceType: "page",
		ResourceID:   pageID.String(),
	})

	pg, err = s.GetPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	cand, err = s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}

	out := &approveCandidateOutput{}
	out.ETag = platform.FormatETag(candID.String())
	out.Body.Page = pg
	out.Body.Revision = cand
	return out, nil
}

// ─── Candidate reject ─────────────────────────────────────────────────────────

type rejectCandidateInput struct {
	ID     string `path:"id"`
	CandID string `path:"cand_id"`
}

type rejectCandidateOutput struct {
	Body struct {
		Revision *Revision `json:"revision"`
	}
}

func (s *Service) handleRejectCandidate(ctx context.Context, in *rejectCandidateInput) (*rejectCandidateOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	candID, err := uuid.Parse(in.CandID)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_id", "invalid candidate revision ID")
	}

	if _, err := s.authPage(ctx, p, pageID, org.RoleEditor); err != nil {
		return nil, err
	}

	cand, err := s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}
	if cand.PageID != pageID {
		return nil, platform.BadRequest("revision.wrong_page", "candidate belongs to a different page")
	}
	if cand.Status != "candidate" {
		return nil, platform.BadRequest("revision.not_candidate", "revision is not a candidate")
	}

	if _, err := s.pool.Exec(ctx,
		`UPDATE page_revisions SET status='rejected' WHERE id=$1`, candID,
	); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "page.candidate_reject",
		ResourceType: "page",
		ResourceID:   pageID.String(),
	})

	cand, err = s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}

	out := &rejectCandidateOutput{}
	out.Body.Revision = cand
	return out, nil
}

// ─── Presence heartbeat ───────────────────────────────────────────────────────

type presenceHeartbeatInput struct {
	ID   string `path:"id"`
	Body struct {
		ClientID string `json:"client_id" required:"true"`
	}
}

type presenceHeartbeatOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handlePresenceHeartbeat(ctx context.Context, in *presenceHeartbeatInput) (*presenceHeartbeatOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	if _, err := s.authPage(ctx, p, pageID, org.RoleViewer); err != nil {
		return nil, err
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO page_presence (page_id, user_id, client_id, since, last_heartbeat)
		 VALUES ($1, $2, $3, now(), now())
		 ON CONFLICT (page_id, client_id)
		 DO UPDATE SET last_heartbeat = now(), user_id = $2`,
		pageID, p.UserID, in.Body.ClientID,
	)
	if err != nil {
		return nil, err
	}

	out := &presenceHeartbeatOutput{}
	out.Body.OK = true
	return out, nil
}

// ─── Presence list ────────────────────────────────────────────────────────────

type presenceListInput struct {
	ID string `path:"id"`
}

type presenceEntry struct {
	UserID        uuid.UUID `json:"user_id"`
	Since         time.Time `json:"since"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
}

type presenceListOutput struct {
	Body struct {
		Present []presenceEntry `json:"present"`
	}
}

func (s *Service) handlePresenceList(ctx context.Context, in *presenceListInput) (*presenceListOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	if _, err := s.authPage(ctx, p, pageID, org.RoleViewer); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT user_id, since, last_heartbeat
		 FROM page_presence
		 WHERE page_id = $1
		   AND last_heartbeat > now() - interval '30 seconds'
		 ORDER BY since`,
		pageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []presenceEntry
	for rows.Next() {
		var e presenceEntry
		if err := rows.Scan(&e.UserID, &e.Since, &e.LastHeartbeat); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	if entries == nil {
		entries = []presenceEntry{}
	}

	out := &presenceListOutput{}
	out.Body.Present = entries
	return out, nil
}
