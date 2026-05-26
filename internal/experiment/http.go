package experiment

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires experiment HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// Experiments under a project.
	huma.Register(api, huma.Operation{
		OperationID: "experiment-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/experiments",
		Summary:     "Create an experiment",
		Description: "Creates a new experiment run (measurement, synthesis, etc.) within a project. Optionally associates the experiment with an iteration. Requires editor role on the project.",
		Tags:        []string{"experiments"},
	}, svc.handleCreateExperiment)

	huma.Register(api, huma.Operation{
		OperationID: "experiment-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/experiments",
		Summary:     "List experiments in a project",
		Description: "Returns experiments in a project with optional filters: `iteration_id`, `method`, and `sample_id`. Requires viewer role on the project.",
		Tags:        []string{"experiments"},
	}, svc.handleListExperiments)

	// Single experiment endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "experiment-get",
		Method:      http.MethodGet,
		Path:        "/v1/experiments/{id}",
		Summary:     "Get an experiment",
		Description: "Returns a single experiment by ID including its method, parameters, and result summary. Requires viewer role on the experiment's project.",
		Tags:        []string{"experiments"},
	}, svc.handleGetExperiment)

	huma.Register(api, huma.Operation{
		OperationID: "experiment-update",
		Method:      http.MethodPatch,
		Path:        "/v1/experiments/{id}",
		Summary:     "Update an experiment",
		Description: "Applies a partial update to an experiment (method, parameters, result_summary, status, etc.). Requires editor role on the experiment's project.",
		Tags:        []string{"experiments"},
	}, svc.handleUpdateExperiment)

	// Sample linking.
	huma.Register(api, huma.Operation{
		OperationID: "experiment-sample-link",
		Method:      http.MethodPost,
		Path:        "/v1/experiments/{id}/samples",
		Summary:     "Link a sample to an experiment",
		Description: "Associates an existing sample with an experiment in a given role (subject, reference, control, byproduct). Requires editor role on the experiment's project.",
		Tags:        []string{"experiments"},
	}, svc.handleLinkSample)

	huma.Register(api, huma.Operation{
		OperationID: "experiment-sample-unlink",
		Method:      http.MethodDelete,
		Path:        "/v1/experiments/{id}/samples/{sid}",
		Summary:     "Unlink a sample from an experiment",
		Description: "Removes the association between a sample and an experiment. Requires editor role on the experiment's project.",
		Tags:        []string{"experiments"},
	}, svc.handleUnlinkSample)

	huma.Register(api, huma.Operation{
		OperationID: "experiment-sample-list",
		Method:      http.MethodGet,
		Path:        "/v1/experiments/{id}/samples",
		Summary:     "List samples linked to an experiment",
		Description: "Returns all samples associated with an experiment including their roles and notes. Requires viewer role on the experiment's project.",
		Tags:        []string{"experiments"},
	}, svc.handleListSamples)
}

// ─── Create experiment ────────────────────────────────────────────────────────

type createExperimentInput struct {
	ID   string `path:"id"`
	Body struct {
		Method        string          `json:"method,omitempty" enum:"cycling,synthesis,SEM,XRD,EIS,weighing,drying,custom" example:"EIS"`
		Parameters    json.RawMessage `json:"parameters,omitempty"`
		ResultSummary string          `json:"result_summary,omitempty" example:"Impedance at 1 kHz: 42 Ω·cm²"`
		IterationID   *uuid.UUID      `json:"iteration_id,omitempty"`
		Status        string          `json:"status,omitempty" enum:"planned,in_progress,completed,failed" example:"completed"`
		PerformedAt   *time.Time      `json:"performed_at,omitempty"`
	}
}

type createExperimentOutput struct {
	Status int
	Body   *Experiment
}

func (s *Service) handleCreateExperiment(ctx context.Context, in *createExperimentInput) (*createExperimentOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	exp, err := s.CreateExperiment(ctx,
		projectID,
		in.Body.Method,
		in.Body.Parameters,
		in.Body.ResultSummary,
		in.Body.IterationID,
		in.Body.Status,
		in.Body.PerformedAt,
		p.UserID,
	)
	if err != nil {
		return nil, err
	}
	return &createExperimentOutput{Status: http.StatusCreated, Body: exp}, nil
}

// ─── List experiments ─────────────────────────────────────────────────────────

type listExperimentsInput struct {
	ID          string `path:"id"`
	IterationID string `query:"iteration_id"`
	Method      string `query:"method"`
	SampleID    string `query:"sample_id"`
}

type listExperimentsOutput struct {
	Body []*Experiment
}

func (s *Service) handleListExperiments(ctx context.Context, in *listExperimentsInput) (*listExperimentsOutput, error) {
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

	var iterationID *uuid.UUID
	if in.IterationID != "" {
		id, err := uuid.Parse(in.IterationID)
		if err != nil {
			return nil, platform.BadRequest("experiment.invalid_iteration_id", "invalid iteration_id")
		}
		iterationID = &id
	}

	var sampleID *uuid.UUID
	if in.SampleID != "" {
		id, err := uuid.Parse(in.SampleID)
		if err != nil {
			return nil, platform.BadRequest("experiment.invalid_sample_id", "invalid sample_id")
		}
		sampleID = &id
	}

	list, err := s.ListExperiments(ctx, projectID, iterationID, in.Method, sampleID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Experiment{}
	}
	return &listExperimentsOutput{Body: list}, nil
}

// ─── Get experiment ───────────────────────────────────────────────────────────

type getExperimentInput struct {
	ID string `path:"id"`
}

type getExperimentOutput struct {
	Body *Experiment
}

func (s *Service) handleGetExperiment(ctx context.Context, in *getExperimentInput) (*getExperimentOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	expID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("experiment.invalid_id", "invalid experiment ID")
	}

	exp, err := s.GetExperiment(ctx, expID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, exp.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	return &getExperimentOutput{Body: exp}, nil
}

// ─── Update experiment ────────────────────────────────────────────────────────

type updateExperimentInput struct {
	ID   string `path:"id"`
	Body struct {
		Method        string          `json:"method,omitempty" enum:"cycling,synthesis,SEM,XRD,EIS,weighing,drying,custom"`
		Parameters    json.RawMessage `json:"parameters,omitempty"`
		ResultSummary *string         `json:"result_summary,omitempty"`
		IterationID   *uuid.UUID      `json:"iteration_id,omitempty"`
		Status        string          `json:"status,omitempty" enum:"planned,in_progress,completed,failed"`
		PerformedAt   *time.Time      `json:"performed_at,omitempty"`
	}
}

type updateExperimentOutput struct {
	Body *Experiment
}

func (s *Service) handleUpdateExperiment(ctx context.Context, in *updateExperimentInput) (*updateExperimentOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	expID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("experiment.invalid_id", "invalid experiment ID")
	}

	exp, err := s.GetExperiment(ctx, expID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, exp.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	updated, err := s.UpdateExperiment(ctx,
		expID,
		in.Body.Method,
		in.Body.Parameters,
		in.Body.ResultSummary,
		in.Body.IterationID,
		false,
		in.Body.Status,
		in.Body.PerformedAt,
		p.UserID,
	)
	if err != nil {
		return nil, err
	}
	return &updateExperimentOutput{Body: updated}, nil
}

// ─── Link sample ──────────────────────────────────────────────────────────────

type linkSampleInput struct {
	ID   string `path:"id"`
	Body struct {
		SampleID uuid.UUID `json:"sample_id" required:"true"`
		Role     *string   `json:"role,omitempty" enum:"subject,reference,control,byproduct"`
		Note     string    `json:"note,omitempty"`
	}
}

type linkSampleOutput struct {
	Status int
	Body   struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleLinkSample(ctx context.Context, in *linkSampleInput) (*linkSampleOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	expID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("experiment.invalid_id", "invalid experiment ID")
	}

	exp, err := s.GetExperiment(ctx, expID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, exp.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if err := s.LinkSample(ctx, expID, in.Body.SampleID, in.Body.Role, in.Body.Note, p.UserID); err != nil {
		return nil, err
	}

	out := &linkSampleOutput{Status: http.StatusCreated}
	out.Body.OK = true
	return out, nil
}

// ─── Unlink sample ────────────────────────────────────────────────────────────

type unlinkSampleInput struct {
	ID  string `path:"id"`
	Sid string `path:"sid"`
}

type unlinkSampleOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleUnlinkSample(ctx context.Context, in *unlinkSampleInput) (*unlinkSampleOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	expID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("experiment.invalid_id", "invalid experiment ID")
	}

	sampleID, err := uuid.Parse(in.Sid)
	if err != nil {
		return nil, platform.BadRequest("experiment.invalid_sample_id", "invalid sample ID")
	}

	exp, err := s.GetExperiment(ctx, expID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, exp.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if err := s.UnlinkSample(ctx, expID, sampleID, p.UserID); err != nil {
		return nil, err
	}

	return &unlinkSampleOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}

// ─── List samples ─────────────────────────────────────────────────────────────

type listSamplesInput struct {
	ID string `path:"id"`
}

type listSamplesOutput struct {
	Body []*ExperimentSample
}

func (s *Service) handleListSamples(ctx context.Context, in *listSamplesInput) (*listSamplesOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	expID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("experiment.invalid_id", "invalid experiment ID")
	}

	exp, err := s.GetExperiment(ctx, expID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, exp.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	samples, err := s.ListSamples(ctx, expID)
	if err != nil {
		return nil, err
	}
	if samples == nil {
		samples = []*ExperimentSample{}
	}
	return &listSamplesOutput{Body: samples}, nil
}
