package ai

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// RegisterWorkflows mounts workflow-related endpoints on the huma API.
func RegisterWorkflows(api huma.API, svc *Service, workflows map[string]*Workflow) {
	// GET /v1/ai/workflows — list available workflow definitions.
	huma.Register(api, huma.Operation{
		OperationID: "ai-list-workflows",
		Method:      http.MethodGet,
		Path:        "/v1/ai/workflows",
		Summary:     "List available LLM risk-assessment workflows",
		Tags:        []string{"LLM"},
	}, func(ctx context.Context, _ *struct{}) (*workflowListOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		if err := platform.RequireScope(p, platform.ScopeReadAI); err != nil {
			return nil, err
		}
		var items []WorkflowSummary
		for _, wf := range workflows {
			items = append(items, WorkflowSummary{
				Key:          wf.Key,
				Title:        wf.Title,
				Description:  wf.Description,
				Scope:        wf.Scope,
				Steps:        wf.Steps,
				OutputSchema: wf.OutputSchema,
			})
		}
		return &workflowListOutput{Body: struct {
			Items []WorkflowSummary `json:"items"`
		}{Items: items}}, nil
	})

	// POST /v1/ai/workflows/{key}/run — run a workflow synchronously.
	huma.Register(api, huma.Operation{
		OperationID: "ai-run-workflow",
		Method:      http.MethodPost,
		Path:        "/v1/ai/workflows/{key}/run",
		Summary:     "Run a risk-assessment workflow synchronously",
		Tags:        []string{"LLM"},
	}, func(ctx context.Context, input *runWorkflowInput) (*workflowRunOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		if err := platform.RequireScope(p, platform.ScopeWriteAI); err != nil {
			return nil, err
		}

		projectID, err := uuid.Parse(input.Body.ProjectID)
		if err != nil {
			return nil, platform.BadRequest("invalid_project_id", "invalid project_id")
		}

		target := WorkflowTarget{ProjectID: projectID}

		if input.Body.SampleID != "" {
			sid, err := uuid.Parse(input.Body.SampleID)
			if err != nil {
				return nil, platform.BadRequest("invalid_sample_id", "invalid sample_id")
			}
			target.SampleID = &sid
		}
		if input.Body.ExperimentID != "" {
			eid, err := uuid.Parse(input.Body.ExperimentID)
			if err != nil {
				return nil, platform.BadRequest("invalid_experiment_id", "invalid experiment_id")
			}
			target.ExperimentID = &eid
		}
		if input.Body.IterationID != "" {
			iid, err := uuid.Parse(input.Body.IterationID)
			if err != nil {
				return nil, platform.BadRequest("invalid_iteration_id", "invalid iteration id")
			}
			target.IterationID = &iid
		}

		run, err := svc.RunWorkflow(ctx, p, input.Key, target)
		if err != nil {
			return nil, err
		}
		return &workflowRunOutput{Body: run}, nil
	})

	// GET /v1/ai/runs/{id} — fetch a run by ID.
	huma.Register(api, huma.Operation{
		OperationID: "ai-get-workflow-run",
		Method:      http.MethodGet,
		Path:        "/v1/ai/runs/{id}",
		Summary:     "Get a workflow run by ID",
		Tags:        []string{"LLM"},
	}, func(ctx context.Context, input *getRunInput) (*workflowRunOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		if err := platform.RequireScope(p, platform.ScopeReadAI); err != nil {
			return nil, err
		}

		runID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_run_id", "invalid run id")
		}

		run, err := GetRun(ctx, svc.pool, runID)
		if err != nil {
			return nil, err
		}
		if run == nil {
			return nil, platform.NotFound("ai.run_not_found", "workflow run not found")
		}

		if run.ProjectID == nil {
			return nil, platform.NotFound("ai.run_not_found", "workflow run not found")
		}
		if _, _, err := svc.projects.Authorize(ctx, p, *run.ProjectID, org.RoleViewer); err != nil {
			return nil, err
		}

		return &workflowRunOutput{Body: run}, nil
	})
}

// ─── Input/Output types ───────────────────────────────────────────────────────

type workflowListOutput struct {
	Body struct {
		Items []WorkflowSummary `json:"items"`
	}
}

type runWorkflowInput struct {
	Key  string `path:"key"`
	Body struct {
		ProjectID    string `json:"project_id" required:"true"`
		SampleID     string `json:"sample_id,omitempty"`
		ExperimentID string `json:"experiment_id,omitempty"`
		IterationID  string `json:"iteration_id,omitempty"`
	}
}

type workflowRunOutput struct {
	Body *WorkflowRun
}

type getRunInput struct {
	ID string `path:"id"`
}
