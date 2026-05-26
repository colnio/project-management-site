package iteration

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires iteration HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// Iterations under a project.
	huma.Register(api, huma.Operation{
		OperationID: "iteration-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/iterations",
		Summary:     "Create an iteration",
		Description: "Creates a new iteration (sprint / experimental batch) within a project. Optional start/end dates and a status control the iteration lifecycle. Requires editor role on the project.",
		Tags:        []string{"iterations"},
	}, svc.handleCreateIteration)

	huma.Register(api, huma.Operation{
		OperationID: "iteration-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/iterations",
		Summary:     "List iterations in a project",
		Description: "Returns all iterations for a project ordered by position. Requires viewer role on the project.",
		Tags:        []string{"iterations"},
	}, svc.handleListIterations)

	// Single iteration endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "iteration-get",
		Method:      http.MethodGet,
		Path:        "/v1/iterations/{id}",
		Summary:     "Get an iteration",
		Description: "Returns a single iteration by ID. Requires viewer role on the iteration's project.",
		Tags:        []string{"iterations"},
	}, svc.handleGetIteration)

	huma.Register(api, huma.Operation{
		OperationID: "iteration-update",
		Method:      http.MethodPatch,
		Path:        "/v1/iterations/{id}",
		Summary:     "Update an iteration",
		Description: "Applies a partial update to an iteration (title, status, dates, position). Requires editor role on the iteration's project.",
		Tags:        []string{"iterations"},
	}, svc.handleUpdateIteration)

	huma.Register(api, huma.Operation{
		OperationID: "iteration-delete",
		Method:      http.MethodDelete,
		Path:        "/v1/iterations/{id}",
		Summary:     "Delete an iteration",
		Description: "Permanently deletes an iteration and its sample associations. Requires editor role on the iteration's project.",
		Tags:        []string{"iterations"},
	}, svc.handleDeleteIteration)

	// Sample links under an iteration.
	huma.Register(api, huma.Operation{
		OperationID: "iteration-sample-link",
		Method:      http.MethodPost,
		Path:        "/v1/iterations/{id}/samples",
		Summary:     "Link a sample to an iteration",
		Description: "Associates an existing sample with an iteration in a given role (input, output, passthrough). Requires editor role on the iteration's project.",
		Tags:        []string{"iterations"},
	}, svc.handleLinkSample)

	huma.Register(api, huma.Operation{
		OperationID: "iteration-sample-unlink",
		Method:      http.MethodDelete,
		Path:        "/v1/iterations/{id}/samples/{sid}",
		Summary:     "Unlink a sample from an iteration",
		Description: "Removes the association between a sample and an iteration. Requires editor role on the iteration's project.",
		Tags:        []string{"iterations"},
	}, svc.handleUnlinkSample)

	huma.Register(api, huma.Operation{
		OperationID: "iteration-samples-list",
		Method:      http.MethodGet,
		Path:        "/v1/iterations/{id}/samples",
		Summary:     "List samples linked to an iteration",
		Description: "Returns all samples associated with an iteration including their roles and notes. Requires viewer role on the iteration's project.",
		Tags:        []string{"iterations"},
	}, svc.handleListSamples)
}

// ─── Create iteration ──────────────────────────────────────────────────────────

type createIterationInput struct {
	ID   string `path:"id"`
	Body struct {
		Title       string     `json:"title" required:"true" minLength:"1"`
		Description string     `json:"description,omitempty"`
		Status      string     `json:"status,omitempty" enum:"planned,active,done,blocked"`
		StartAt     *time.Time `json:"start_at,omitempty"`
		EndAt       *time.Time `json:"end_at,omitempty"`
	}
}

type createIterationOutput struct {
	Status int
	Body   *Iteration
}

func (s *Service) handleCreateIteration(ctx context.Context, in *createIterationInput) (*createIterationOutput, error) {
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

	it, err := s.CreateIteration(ctx, projectID,
		in.Body.Title, in.Body.Description, in.Body.Status,
		in.Body.StartAt, in.Body.EndAt,
		p.UserID,
	)
	if err != nil {
		return nil, err
	}
	return &createIterationOutput{Status: http.StatusCreated, Body: it}, nil
}

// ─── List iterations ───────────────────────────────────────────────────────────

type listIterationsInput struct {
	ID string `path:"id"`
}

type listIterationsOutput struct {
	Body []*Iteration
}

func (s *Service) handleListIterations(ctx context.Context, in *listIterationsInput) (*listIterationsOutput, error) {
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

	list, err := s.ListIterations(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Iteration{}
	}
	return &listIterationsOutput{Body: list}, nil
}

// ─── Get iteration ─────────────────────────────────────────────────────────────

type getIterationInput struct {
	ID string `path:"id"`
}

type getIterationOutput struct {
	Body *Iteration
}

func (s *Service) handleGetIteration(ctx context.Context, in *getIterationInput) (*getIterationOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	iterID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("iteration.invalid_id", "invalid iteration ID")
	}

	it, err := s.GetIteration(ctx, iterID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, it.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	return &getIterationOutput{Body: it}, nil
}

// ─── Update iteration ──────────────────────────────────────────────────────────

type updateIterationInput struct {
	ID   string `path:"id"`
	Body struct {
		Title       *string    `json:"title,omitempty"`
		Description *string    `json:"description,omitempty"`
		Status      *string    `json:"status,omitempty" enum:"planned,active,done,blocked"`
		StartAt     **time.Time `json:"start_at,omitempty"`
		EndAt       **time.Time `json:"end_at,omitempty"`
		Position    *int       `json:"position,omitempty"`
	}
}

type updateIterationOutput struct {
	Body *Iteration
}

func (s *Service) handleUpdateIteration(ctx context.Context, in *updateIterationInput) (*updateIterationOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	iterID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("iteration.invalid_id", "invalid iteration ID")
	}

	it, err := s.GetIteration(ctx, iterID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, it.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	updated, err := s.UpdateIteration(ctx, iterID,
		in.Body.Title, in.Body.Description, in.Body.Status,
		in.Body.StartAt, in.Body.EndAt,
		in.Body.Position,
		p.UserID,
	)
	if err != nil {
		return nil, err
	}
	return &updateIterationOutput{Body: updated}, nil
}

// ─── Delete iteration ──────────────────────────────────────────────────────────

type deleteIterationInput struct {
	ID string `path:"id"`
}

type deleteIterationOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleDeleteIteration(ctx context.Context, in *deleteIterationInput) (*deleteIterationOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	iterID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("iteration.invalid_id", "invalid iteration ID")
	}

	it, err := s.GetIteration(ctx, iterID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, it.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if err := s.DeleteIteration(ctx, iterID, p.UserID); err != nil {
		return nil, err
	}

	out := &deleteIterationOutput{}
	out.Body.OK = true
	return out, nil
}

// ─── Link sample ───────────────────────────────────────────────────────────────

type linkSampleInput struct {
	ID   string `path:"id"`
	Body struct {
		SampleID uuid.UUID `json:"sample_id" required:"true"`
		Role     *string   `json:"role,omitempty" enum:"input,output,passthrough"`
		Note     string    `json:"note,omitempty"`
	}
}

type linkSampleOutput struct {
	Status int
	Body   *IterationSample
}

func (s *Service) handleLinkSample(ctx context.Context, in *linkSampleInput) (*linkSampleOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	iterID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("iteration.invalid_id", "invalid iteration ID")
	}

	it, err := s.GetIteration(ctx, iterID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, it.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	is, err := s.LinkSample(ctx, iterID, in.Body.SampleID, in.Body.Role, in.Body.Note, p.UserID)
	if err != nil {
		return nil, err
	}
	return &linkSampleOutput{Status: http.StatusCreated, Body: is}, nil
}

// ─── Unlink sample ─────────────────────────────────────────────────────────────

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

	iterID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("iteration.invalid_id", "invalid iteration ID")
	}

	sampleID, err := uuid.Parse(in.Sid)
	if err != nil {
		return nil, platform.BadRequest("sample.invalid_id", "invalid sample ID")
	}

	it, err := s.GetIteration(ctx, iterID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, it.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if err := s.UnlinkSample(ctx, iterID, sampleID, p.UserID); err != nil {
		return nil, err
	}

	out := &unlinkSampleOutput{}
	out.Body.OK = true
	return out, nil
}

// ─── List samples ──────────────────────────────────────────────────────────────

type listSamplesInput struct {
	ID string `path:"id"`
}

type listSamplesOutput struct {
	Body []*IterationSample
}

func (s *Service) handleListSamples(ctx context.Context, in *listSamplesInput) (*listSamplesOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	iterID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("iteration.invalid_id", "invalid iteration ID")
	}

	it, err := s.GetIteration(ctx, iterID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, it.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	samples, err := s.ListSamples(ctx, iterID)
	if err != nil {
		return nil, err
	}
	if samples == nil {
		samples = []*IterationSample{}
	}
	return &listSamplesOutput{Body: samples}, nil
}
