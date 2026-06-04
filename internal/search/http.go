package search

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires search HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "search-mentions",
		Method:      http.MethodGet,
		Path:        "/v1/search",
		Summary:     "Global search",
		Description: "Cross-workspace search over samples, experiments, projects, and people. Results are scoped to projects the caller can read. Supports an optional current-project context for relevance tiering.",
		Tags:        []string{"search"},
	}, svc.handleSearch)
}

// ─── GET /v1/search ──────────────────────────────────────────────────────────

type searchInput struct {
	Q         string `query:"q"`
	ProjectID string `query:"project_id"`
	Types     string `query:"types"`  // comma-separated: sample,experiment,project,people
	Limit     int    `query:"limit"`
}

type searchOutput struct {
	Body []*Result
}

func (s *Service) handleSearch(ctx context.Context, in *searchInput) (*searchOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadProjects); err != nil {
		return nil, err
	}

	// Parse optional project_id.
	var currentProjectID *uuid.UUID
	if in.ProjectID != "" {
		id, err := uuid.Parse(in.ProjectID)
		if err == nil {
			currentProjectID = &id
		}
		// Ignore parse error — nil means no project context.
	}

	// Split types on comma; nil → all.
	var types []string
	if in.Types != "" {
		for _, t := range strings.Split(in.Types, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				types = append(types, t)
			}
		}
	}

	results, err := s.Search(ctx, p, in.Q, currentProjectID, types, in.Limit)
	if err != nil {
		return nil, err
	}
	if results == nil {
		results = []*Result{}
	}
	return &searchOutput{Body: results}, nil
}
