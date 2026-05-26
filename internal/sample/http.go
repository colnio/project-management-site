package sample

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires sample HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// Samples under a project.
	huma.Register(api, huma.Operation{
		OperationID: "sample-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/samples",
		Summary:     "Create a sample",
		Description: "Creates a new physical or virtual sample within a project. Supports freeform JSON properties for domain-specific metadata. Requires editor role on the project.",
		Tags:        []string{"samples"},
	}, svc.handleCreateSample)

	huma.Register(api, huma.Operation{
		OperationID: "sample-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/samples",
		Summary:     "List samples in a project",
		Description: "Returns all samples in a project, optionally filtered by `kind`. Requires viewer role on the project.",
		Tags:        []string{"samples"},
	}, svc.handleListSamples)

	// Single sample endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "sample-get",
		Method:      http.MethodGet,
		Path:        "/v1/samples/{id}",
		Summary:     "Get a sample",
		Description: "Returns a single sample by ID including its properties and current status. Requires viewer role on the sample's project.",
		Tags:        []string{"samples"},
	}, svc.handleGetSample)

	huma.Register(api, huma.Operation{
		OperationID: "sample-patch",
		Method:      http.MethodPatch,
		Path:        "/v1/samples/{id}",
		Summary:     "Update a sample",
		Description: "Applies a partial update to a sample's fields (name, status, properties, etc.). Requires editor role on the sample's project.",
		Tags:        []string{"samples"},
	}, svc.handlePatchSample)

	huma.Register(api, huma.Operation{
		OperationID: "sample-relation-add",
		Method:      http.MethodPost,
		Path:        "/v1/samples/{id}/relations",
		Summary:     "Add a sample relation",
		Description: "Records a directed relationship (e.g. derived_from, split_from) between two samples for lineage tracking. Requires editor role on the parent sample's project.",
		Tags:        []string{"samples"},
	}, svc.handleAddRelation)

	huma.Register(api, huma.Operation{
		OperationID: "sample-lineage",
		Method:      http.MethodGet,
		Path:        "/v1/samples/{id}/lineage",
		Summary:     "Get sample lineage graph",
		Description: "Returns the full ancestor/descendant graph of a sample as a set of nodes and directed edges. Requires viewer role on the sample's project.",
		Tags:        []string{"samples"},
	}, svc.handleGetLineage)
}

// ─── Create sample ─────────────────────────────────────────────────────────────

type createSampleInput struct {
	ID   string `path:"id"`
	Body struct {
		Identifier  string          `json:"identifier" required:"true" minLength:"1" example:"EL-2024-042"`
		Name        string          `json:"name,omitempty" example:"LLZO Pellet A"`
		Description string          `json:"description,omitempty" example:"Sintered at 1150 °C for 12 h in O2 atmosphere."`
		Kind        string          `json:"kind,omitempty" enum:"precursor,electrode,cell,module,derivative,other" example:"electrode"`
		Properties  json.RawMessage `json:"properties,omitempty"`
		Status      string          `json:"status,omitempty" enum:"active,consumed,archived,failed" example:"active"`
	}
}

type createSampleOutput struct {
	Status int
	Body   *Sample
}

func (s *Service) handleCreateSample(ctx context.Context, in *createSampleInput) (*createSampleOutput, error) {
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

	if len(in.Body.Properties) > 0 {
		if err := validateJSONObject(in.Body.Properties); err != nil {
			return nil, platform.BadRequest("sample.invalid_properties", "properties must be a JSON object")
		}
	}

	sm, err := s.createSample(ctx, projectID,
		in.Body.Identifier, in.Body.Name, in.Body.Description,
		in.Body.Kind, in.Body.Properties, in.Body.Status, p.UserID)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "sample.create",
		ResourceType: "sample",
		ResourceID:   sm.ID.String(),
	})

	return &createSampleOutput{Status: http.StatusCreated, Body: sm}, nil
}

// ─── List samples ──────────────────────────────────────────────────────────────

type listSamplesInput struct {
	ID   string `path:"id"`
	Kind string `query:"kind"`
}

type listSamplesOutput struct {
	Body []*Sample
}

func (s *Service) handleListSamples(ctx context.Context, in *listSamplesInput) (*listSamplesOutput, error) {
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

	list, err := s.listSamples(ctx, projectID, in.Kind)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Sample{}
	}
	return &listSamplesOutput{Body: list}, nil
}

// ─── Get sample ────────────────────────────────────────────────────────────────

type getSampleInput struct {
	ID string `path:"id"`
}

type getSampleOutput struct {
	Body *Sample
}

func (s *Service) handleGetSample(ctx context.Context, in *getSampleInput) (*getSampleOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	sampleID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("sample.invalid_id", "invalid sample ID")
	}

	sm, err := s.GetSample(ctx, sampleID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, sm.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	return &getSampleOutput{Body: sm}, nil
}

// ─── Patch sample ──────────────────────────────────────────────────────────────

type patchSampleInput struct {
	ID   string `path:"id"`
	Body struct {
		Name        *string         `json:"name,omitempty"`
		Description *string         `json:"description,omitempty"`
		Kind        *string         `json:"kind,omitempty"`
		Status      *string         `json:"status,omitempty"`
		Identifier  *string         `json:"identifier,omitempty"`
		Properties  json.RawMessage `json:"properties,omitempty"`
	}
}

type patchSampleOutput struct {
	Body *Sample
}

func (s *Service) handlePatchSample(ctx context.Context, in *patchSampleInput) (*patchSampleOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	sampleID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("sample.invalid_id", "invalid sample ID")
	}

	// Load sample first to get project_id for authorization.
	sm, err := s.GetSample(ctx, sampleID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, sm.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if len(in.Body.Properties) > 0 {
		if err := validateJSONObject(in.Body.Properties); err != nil {
			return nil, platform.BadRequest("sample.invalid_properties", "properties must be a JSON object")
		}
	}

	updated, err := s.patchSample(ctx, sampleID,
		in.Body.Name, in.Body.Description, in.Body.Kind,
		in.Body.Status, in.Body.Identifier, in.Body.Properties)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "sample.update",
		ResourceType: "sample",
		ResourceID:   updated.ID.String(),
	})

	return &patchSampleOutput{Body: updated}, nil
}

// ─── Add relation ──────────────────────────────────────────────────────────────

type addRelationInput struct {
	ID   string `path:"id"`
	Body struct {
		ChildSampleID uuid.UUID `json:"child_sample_id" required:"true"`
		RelationType  string    `json:"relation_type" required:"true" enum:"derived_from,split_from,assembled_into,tested_as,duplicate_of"`
		Notes         string    `json:"notes,omitempty"`
	}
}

type addRelationOutput struct {
	Status int
	Body   *SampleRelation
}

func (s *Service) handleAddRelation(ctx context.Context, in *addRelationInput) (*addRelationOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	parentID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("sample.invalid_id", "invalid sample ID")
	}

	// Load parent sample to authorise against its project.
	parent, err := s.GetSample(ctx, parentID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, parent.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	rel, err := s.addRelation(ctx, parentID, in.Body.ChildSampleID, in.Body.RelationType, in.Body.Notes)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "sample.relation_add",
		ResourceType: "sample",
		ResourceID:   parentID.String(),
	})

	return &addRelationOutput{Status: http.StatusCreated, Body: rel}, nil
}

// ─── Get lineage ───────────────────────────────────────────────────────────────

type getLineageInput struct {
	ID string `path:"id"`
}

type getLineageOutput struct {
	Body *LineageGraph
}

func (s *Service) handleGetLineage(ctx context.Context, in *getLineageInput) (*getLineageOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	sampleID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("sample.invalid_id", "invalid sample ID")
	}

	sm, err := s.GetSample(ctx, sampleID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, sm.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	graph, err := s.getLineage(ctx, sampleID)
	if err != nil {
		return nil, err
	}

	return &getLineageOutput{Body: graph}, nil
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

// validateJSONObject returns an error if b is not a valid JSON object.
func validateJSONObject(b json.RawMessage) error {
	if len(b) == 0 {
		return nil
	}
	var obj map[string]any
	if err := json.Unmarshal(b, &obj); err != nil {
		return err
	}
	return nil
}
