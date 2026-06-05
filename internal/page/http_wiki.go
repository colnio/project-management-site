package page

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/colnio/project-management-site/internal/platform"
)

// ─── Wiki list ────────────────────────────────────────────────────────────────

type listWikiPagesInput struct{}

type listWikiPagesOutput struct {
	Body struct {
		Items []PageListItem `json:"items"`
	}
}

func (s *Service) handleListWikiPages(ctx context.Context, _ *listWikiPagesInput) (*listWikiPagesOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadPages); err != nil {
		return nil, err
	}

	items, err := s.listWikiPages(ctx)
	if err != nil {
		return nil, err
	}

	out := &listWikiPagesOutput{}
	out.Body.Items = items
	return out, nil
}

// ─── Wiki create ──────────────────────────────────────────────────────────────

type createWikiPageInput struct {
	Body struct {
		Title  string          `json:"title,omitempty"`
		Blocks json.RawMessage `json:"blocks,omitempty"`
	}
}

type createWikiPageOutput struct {
	Status int
	ETag   string `header:"ETag"`
	Body   struct {
		Page   *Page           `json:"page"`
		Blocks json.RawMessage `json:"blocks"`
	}
}

func (s *Service) handleCreateWikiPage(ctx context.Context, in *createWikiPageInput) (*createWikiPageOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWritePages); err != nil {
		return nil, err
	}

	blocks := in.Body.Blocks
	if len(blocks) == 0 || string(blocks) == "null" {
		// Seed a heading + empty paragraph if no blocks provided.
		title := in.Body.Title
		if title == "" {
			title = "Untitled"
		}
		blocks = buildInitialWikiBlocks(title)
	}

	// Validate it's an array.
	if blocks[0] != '[' {
		return nil, platform.BadRequest("page.invalid_blocks", "blocks must be a JSON array")
	}

	// Wiki pages: project_id=NULL, parent_type='wiki', parent_id=sentinel.
	pg, _, canonical, err := s.createPage(ctx, nil, "wiki", WikiSentinelParentID, "", blocks, p.UserID)
	if err != nil {
		return nil, err
	}

	out := &createWikiPageOutput{Status: http.StatusCreated}
	out.ETag = platform.FormatETag(pg.CurrentRevisionID.String())
	out.Body.Page = pg
	out.Body.Blocks = canonical
	return out, nil
}

// buildInitialWikiBlocks returns a BlockNote-compatible JSON array with a
// heading block (containing the given title) followed by an empty paragraph.
func buildInitialWikiBlocks(title string) json.RawMessage {
	raw, _ := json.Marshal([]map[string]any{
		{
			"id":       "heading-1",
			"type":     "heading",
			"props":    map[string]any{"level": 1},
			"content":  []map[string]any{{"type": "text", "text": title, "styles": map[string]any{}}},
			"children": []any{},
		},
		{
			"id":       "paragraph-1",
			"type":     "paragraph",
			"props":    map[string]any{},
			"content":  []any{},
			"children": []any{},
		},
	})
	return json.RawMessage(fmt.Sprintf("%s", raw))
}
