package artifact

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires artifact HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// Project-scoped artifact endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "artifact-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/artifacts",
		Summary:     "Create an artifact and get a presigned upload URL",
		Description: "Registers a new artifact record and returns a presigned S3 PUT URL. Upload the file directly to the URL, then call the complete endpoint. Requires viewer role on the project (project auth is implicit via the service).",
		Tags:        []string{"artifacts"},
	}, svc.handleCreateArtifact)

	huma.Register(api, huma.Operation{
		OperationID: "artifact-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/artifacts",
		Summary:     "List artifacts in a project",
		Description: "Returns all artifacts registered in a project, regardless of upload status. Requires viewer role on the project.",
		Tags:        []string{"artifacts"},
	}, svc.handleListArtifacts)

	// Single artifact endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "artifact-get",
		Method:      http.MethodGet,
		Path:        "/v1/artifacts/{id}",
		Summary:     "Get an artifact",
		Description: "Returns a single artifact by ID including its presigned download URL if the upload is complete. Requires viewer role on the artifact's project.",
		Tags:        []string{"artifacts"},
	}, svc.handleGetArtifact)

	huma.Register(api, huma.Operation{
		OperationID: "artifact-complete",
		Method:      http.MethodPost,
		Path:        "/v1/artifacts/{id}/complete",
		Summary:     "Mark artifact upload complete",
		Description: "Transitions an artifact from `pending` to `ready` after the file has been uploaded to the presigned URL. Requires an authenticated session.",
		Tags:        []string{"artifacts"},
	}, svc.handleCompleteArtifact)

	huma.Register(api, huma.Operation{
		OperationID: "artifact-delete",
		Method:      http.MethodDelete,
		Path:        "/v1/artifacts/{id}",
		Summary:     "Delete an artifact",
		Description: "Deletes an artifact record and its associated S3 object. Requires an authenticated session (ownership is checked internally).",
		Tags:        []string{"artifacts"},
	}, svc.handleDeleteArtifact)

	// Sample attachment endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "artifact-attach-sample",
		Method:      http.MethodPost,
		Path:        "/v1/samples/{sid}/artifacts",
		Summary:     "Attach an artifact to a sample",
		Description: "Links an existing artifact to a sample in a given role (specimen_image, datasheet, reference, other). Requires an authenticated session.",
		Tags:        []string{"artifacts"},
	}, svc.handleAttachSample)

	huma.Register(api, huma.Operation{
		OperationID: "artifact-list-sample",
		Method:      http.MethodGet,
		Path:        "/v1/samples/{sid}/artifacts",
		Summary:     "List artifacts for a sample",
		Description: "Returns all artifacts attached to a sample. Requires an authenticated session.",
		Tags:        []string{"artifacts"},
	}, svc.handleListSampleArtifacts)

	// Experiment attachment endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "artifact-attach-experiment",
		Method:      http.MethodPost,
		Path:        "/v1/experiments/{eid}/artifacts",
		Summary:     "Attach an artifact to an experiment",
		Description: "Links an existing artifact to an experiment in a given role (raw_data, analysis, report, calibration, photo, other). Requires an authenticated session.",
		Tags:        []string{"artifacts"},
	}, svc.handleAttachExperiment)

	huma.Register(api, huma.Operation{
		OperationID: "artifact-list-experiment",
		Method:      http.MethodGet,
		Path:        "/v1/experiments/{eid}/artifacts",
		Summary:     "List artifacts for an experiment",
		Description: "Returns all artifacts attached to an experiment. Requires an authenticated session.",
		Tags:        []string{"artifacts"},
	}, svc.handleListExperimentArtifacts)
}

// ─── Create artifact ──────────────────────────────────────────────────────────

type createArtifactInput struct {
	ID   string `path:"id"`
	Body struct {
		Filename    string `json:"filename" required:"true" minLength:"1"`
		ContentType string `json:"content_type" required:"true" minLength:"1"`
		SizeBytes   int64  `json:"size_bytes"`
		Type        string `json:"type,omitempty" enum:"pdf,ipynb,image,other"`
	}
}

type createArtifactOutput struct {
	Status int
	Body   struct {
		Artifact  *Artifact         `json:"artifact"`
		UploadURL string            `json:"upload_url"`
		Method    string            `json:"method"`
		Headers   map[string]string `json:"headers"`
	}
}

func (s *Service) handleCreateArtifact(ctx context.Context, in *createArtifactInput) (*createArtifactOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteArtifacts); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_project_id", "invalid project ID")
	}

	art, uploadURL, err := s.CreateArtifact(ctx, projectID, in.Body.Filename, in.Body.ContentType, in.Body.Type, in.Body.SizeBytes)
	if err != nil {
		return nil, err
	}

	out := &createArtifactOutput{Status: http.StatusCreated}
	out.Body.Artifact = art
	out.Body.UploadURL = uploadURL
	out.Body.Method = "PUT"
	out.Body.Headers = map[string]string{
		"Content-Type": in.Body.ContentType,
	}
	return out, nil
}

// ─── List artifacts ───────────────────────────────────────────────────────────

type listArtifactsInput struct {
	ID string `path:"id"`
}

type listArtifactsOutput struct {
	Body []*Artifact
}

func (s *Service) handleListArtifacts(ctx context.Context, in *listArtifactsInput) (*listArtifactsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadArtifacts); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_project_id", "invalid project ID")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	list, err := s.listByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Artifact{}
	}
	return &listArtifactsOutput{Body: list}, nil
}

// ─── Get artifact ─────────────────────────────────────────────────────────────

type getArtifactInput struct {
	ID string `path:"id"`
}

type getArtifactOutput struct {
	Body *Artifact
}

func (s *Service) handleGetArtifact(ctx context.Context, in *getArtifactInput) (*getArtifactOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadArtifacts); err != nil {
		return nil, err
	}

	artID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_id", "invalid artifact ID")
	}

	art, err := s.GetArtifact(ctx, artID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, art.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	return &getArtifactOutput{Body: art}, nil
}

// ─── Complete artifact upload ─────────────────────────────────────────────────

type completeArtifactInput struct {
	ID   string    `path:"id"`
	Body *struct{} // empty body is allowed
}

type completeArtifactOutput struct {
	Body *Artifact
}

func (s *Service) handleCompleteArtifact(ctx context.Context, in *completeArtifactInput) (*completeArtifactOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteArtifacts); err != nil {
		return nil, err
	}

	artID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_id", "invalid artifact ID")
	}

	art, err := s.CompleteUpload(ctx, artID)
	if err != nil {
		return nil, err
	}

	return &completeArtifactOutput{Body: art}, nil
}

// ─── Delete artifact ──────────────────────────────────────────────────────────

type deleteArtifactInput struct {
	ID string `path:"id"`
}

type deleteArtifactOutput struct {
	Status int
}

func (s *Service) handleDeleteArtifact(ctx context.Context, in *deleteArtifactInput) (*deleteArtifactOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteArtifacts); err != nil {
		return nil, err
	}

	artID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_id", "invalid artifact ID")
	}

	if err := s.DeleteArtifact(ctx, artID); err != nil {
		return nil, err
	}

	return &deleteArtifactOutput{Status: http.StatusNoContent}, nil
}

// ─── Attach artifact to sample ────────────────────────────────────────────────

type attachSampleInput struct {
	SID  string `path:"sid"`
	Body struct {
		ArtifactID uuid.UUID `json:"artifact_id" required:"true"`
		Role       string    `json:"role,omitempty" enum:"specimen_image,datasheet,reference,other"`
	}
}

type attachSampleOutput struct {
	Status int
	Body   *SampleArtifact
}

func (s *Service) handleAttachSample(ctx context.Context, in *attachSampleInput) (*attachSampleOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteArtifacts); err != nil {
		return nil, err
	}

	sampleID, err := uuid.Parse(in.SID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_sample_id", "invalid sample ID")
	}

	sa, err := s.AttachToSample(ctx, sampleID, in.Body.ArtifactID, in.Body.Role)
	if err != nil {
		return nil, err
	}

	return &attachSampleOutput{Status: http.StatusCreated, Body: sa}, nil
}

// ─── List artifacts for sample ────────────────────────────────────────────────

type listSampleArtifactsInput struct {
	SID string `path:"sid"`
}

type listSampleArtifactsOutput struct {
	Body []*Artifact
}

func (s *Service) handleListSampleArtifacts(ctx context.Context, in *listSampleArtifactsInput) (*listSampleArtifactsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadArtifacts); err != nil {
		return nil, err
	}

	sampleID, err := uuid.Parse(in.SID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_sample_id", "invalid sample ID")
	}

	list, err := s.ListSampleArtifacts(ctx, sampleID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Artifact{}
	}
	return &listSampleArtifactsOutput{Body: list}, nil
}

// ─── Attach artifact to experiment ────────────────────────────────────────────

type attachExperimentInput struct {
	EID  string `path:"eid"`
	Body struct {
		ArtifactID uuid.UUID `json:"artifact_id" required:"true"`
		Role       string    `json:"role,omitempty" enum:"raw_data,analysis,report,calibration,photo,other"`
	}
}

type attachExperimentOutput struct {
	Status int
	Body   *ExperimentArtifact
}

func (s *Service) handleAttachExperiment(ctx context.Context, in *attachExperimentInput) (*attachExperimentOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteArtifacts); err != nil {
		return nil, err
	}

	experimentID, err := uuid.Parse(in.EID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_experiment_id", "invalid experiment ID")
	}

	ea, err := s.AttachToExperiment(ctx, experimentID, in.Body.ArtifactID, in.Body.Role)
	if err != nil {
		return nil, err
	}

	return &attachExperimentOutput{Status: http.StatusCreated, Body: ea}, nil
}

// ─── List artifacts for experiment ────────────────────────────────────────────

type listExperimentArtifactsInput struct {
	EID string `path:"eid"`
}

type listExperimentArtifactsOutput struct {
	Body []*Artifact
}

func (s *Service) handleListExperimentArtifacts(ctx context.Context, in *listExperimentArtifactsInput) (*listExperimentArtifactsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadArtifacts); err != nil {
		return nil, err
	}

	experimentID, err := uuid.Parse(in.EID)
	if err != nil {
		return nil, platform.BadRequest("artifact.invalid_experiment_id", "invalid experiment ID")
	}

	list, err := s.ListExperimentArtifacts(ctx, experimentID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Artifact{}
	}
	return &listExperimentArtifactsOutput{Body: list}, nil
}
