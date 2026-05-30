package ai

import (
	"context"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// GetWorkflowRunForTest mirrors GET /v1/ai/runs/{id} for integration tests.
func (s *Service) GetWorkflowRunForTest(ctx context.Context, runID string) (*WorkflowRun, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("authentication required")
	}
	if err := platform.RequireScope(p, platform.ScopeReadAI); err != nil {
		return nil, err
	}

	id, err := uuid.Parse(runID)
	if err != nil {
		return nil, platform.BadRequest("invalid_run_id", "invalid run id")
	}

	run, err := GetRun(ctx, s.pool, id)
	if err != nil {
		return nil, err
	}
	if run == nil {
		return nil, platform.NotFound("ai.run_not_found", "workflow run not found")
	}
	if run.ProjectID == nil {
		return nil, platform.NotFound("ai.run_not_found", "workflow run not found")
	}
	if _, _, err := s.projects.Authorize(ctx, p, *run.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}
	return run, nil
}
