package page

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

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
	if err := platform.RequireScope(p, platform.ScopeReadPages); err != nil {
		return nil, err
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
		Slot       string          `json:"slot,omitempty"`
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
	if err := platform.RequireScope(p, platform.ScopeWritePages); err != nil {
		return nil, err
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

	pg, _, blocks, err := s.createPage(ctx, projectID, in.Body.ParentType, parentID, in.Body.Slot, in.Body.Blocks, p.UserID)
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
		Slot              string          `json:"slot"`
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
	if err := platform.RequireScope(p, platform.ScopeReadPages); err != nil {
		return nil, err
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
	out.Body.Slot = pg.Slot
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
	if err := platform.RequireScope(p, platform.ScopeWritePages); err != nil {
		return nil, err
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

	source := in.Body.Source
	if source == "" {
		source = "human"
	}

	rev, blocks, err := s.updatePage(ctx, pg, in.Body.Blocks, source, in.Body.Candidate, p.UserID, in.IfMatch)
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
