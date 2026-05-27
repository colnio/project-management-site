package risk

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires risk HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// Project-scoped.
	huma.Register(api, huma.Operation{
		OperationID: "risk-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/risks",
		Summary:     "Create a risk",
		Description: "Creates a new risk entry within a project. Requires editor role.",
		Tags:        []string{"risks"},
	}, svc.handleCreateRisk)

	huma.Register(api, huma.Operation{
		OperationID: "risk-list-by-project",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/risks",
		Summary:     "List risks in a project",
		Description: "Returns all risks for a project ordered by seq. Requires viewer role.",
		Tags:        []string{"risks"},
	}, svc.handleListByProject)

	// Iteration-scoped.
	huma.Register(api, huma.Operation{
		OperationID: "risk-list-by-iteration",
		Method:      http.MethodGet,
		Path:        "/v1/iterations/{id}/risks",
		Summary:     "List risks for an iteration",
		Description: "Returns risks scoped to an iteration. Authorizes via the iteration's project. Requires viewer role.",
		Tags:        []string{"risks"},
	}, svc.handleListByIteration)

	// Single-risk endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "risk-patch",
		Method:      http.MethodPatch,
		Path:        "/v1/risks/{id}",
		Summary:     "Update a risk",
		Description: "Applies a partial update to a risk. Requires editor role on the risk's project.",
		Tags:        []string{"risks"},
	}, svc.handlePatchRisk)

	huma.Register(api, huma.Operation{
		OperationID: "risk-delete",
		Method:      http.MethodDelete,
		Path:        "/v1/risks/{id}",
		Summary:     "Delete a risk",
		Description: "Deletes a risk entry. Requires editor role on the risk's project.",
		Tags:        []string{"risks"},
	}, svc.handleDeleteRisk)

	huma.Register(api, huma.Operation{
		OperationID: "risk-set-pi-review",
		Method:      http.MethodPost,
		Path:        "/v1/risks/{id}/pi-review",
		Summary:     "Flag / clear PI review",
		Description: "Sets or clears the flagged_for_pi_review flag on a risk. Requires editor role.",
		Tags:        []string{"risks"},
	}, svc.handleSetPIReview)
}

// ─── Create risk ─────────────────────────────────────────────────────────────

type createRiskInput struct {
	ID   string `path:"id"`
	Body struct {
		Title             string `json:"title" required:"true" minLength:"1"`
		Likelihood        string `json:"likelihood" enum:"high,med,low"`
		ImpactHeadline    string `json:"impact_headline,omitempty"`
		ImpactDescription string `json:"impact_description,omitempty"`
		Mitigation        string `json:"mitigation,omitempty"`
		PlanB             string `json:"plan_b,omitempty"`
		IterationID       string `json:"iteration_id,omitempty"`
	}
}

type createRiskOutput struct {
	Status int
	Body   *Risk
}

func (s *Service) handleCreateRisk(ctx context.Context, in *createRiskInput) (*createRiskOutput, error) {
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

	var iterationID *uuid.UUID
	if in.Body.IterationID != "" {
		parsed, err := uuid.Parse(in.Body.IterationID)
		if err != nil {
			return nil, platform.BadRequest("risk.invalid_iteration_id", "invalid iteration ID")
		}
		iterationID = &parsed
	}

	likelihood := in.Body.Likelihood
	if likelihood == "" {
		likelihood = "low"
	}

	r, err := s.createRisk(ctx, projectID, iterationID,
		in.Body.Title, likelihood,
		in.Body.ImpactHeadline, in.Body.ImpactDescription,
		in.Body.Mitigation, in.Body.PlanB,
		p.UserID,
	)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "risk.create",
		ResourceType: "risk",
		ResourceID:   r.ID.String(),
	})

	return &createRiskOutput{Status: http.StatusCreated, Body: r}, nil
}

// ─── List by project ─────────────────────────────────────────────────────────

type listRisksByProjectInput struct {
	ID string `path:"id"`
}

type listRisksOutput struct {
	Body []*Risk
}

func (s *Service) handleListByProject(ctx context.Context, in *listRisksByProjectInput) (*listRisksOutput, error) {
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

	list, err := s.listByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Risk{}
	}
	return &listRisksOutput{Body: list}, nil
}

// ─── List by iteration ───────────────────────────────────────────────────────

type listRisksByIterationInput struct {
	ID string `path:"id"`
}

func (s *Service) handleListByIteration(ctx context.Context, in *listRisksByIterationInput) (*listRisksOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	iterationID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("iteration.invalid_id", "invalid iteration ID")
	}

	// Resolve the iteration's project_id for authorization.
	var projectID uuid.UUID
	err = s.pool.QueryRow(ctx,
		`SELECT project_id FROM iterations WHERE id = $1`, iterationID,
	).Scan(&projectID)
	if err != nil {
		return nil, platform.NotFound("iteration.not_found", "iteration not found")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	list, err := s.listByIteration(ctx, iterationID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Risk{}
	}
	return &listRisksOutput{Body: list}, nil
}

// ─── Patch risk ───────────────────────────────────────────────────────────────

type patchRiskInput struct {
	ID   string `path:"id"`
	Body struct {
		Title             *string `json:"title,omitempty"`
		Likelihood        *string `json:"likelihood,omitempty"`
		ImpactHeadline    *string `json:"impact_headline,omitempty"`
		ImpactDescription *string `json:"impact_description,omitempty"`
		Mitigation        *string `json:"mitigation,omitempty"`
		PlanB             *string `json:"plan_b,omitempty"`
		Status            *string `json:"status,omitempty"`
		FlaggedForPIReview *bool  `json:"flagged_for_pi_review,omitempty"`
	}
}

type patchRiskOutput struct {
	Body *Risk
}

func (s *Service) handlePatchRisk(ctx context.Context, in *patchRiskInput) (*patchRiskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	riskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("risk.invalid_id", "invalid risk ID")
	}

	r, err := s.GetRisk(ctx, riskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, r.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	updated, err := s.patchRisk(ctx, riskID,
		in.Body.Title, in.Body.Likelihood,
		in.Body.ImpactHeadline, in.Body.ImpactDescription,
		in.Body.Mitigation, in.Body.PlanB,
		in.Body.Status, in.Body.FlaggedForPIReview,
	)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "risk.update",
		ResourceType: "risk",
		ResourceID:   updated.ID.String(),
	})

	return &patchRiskOutput{Body: updated}, nil
}

// ─── Delete risk ──────────────────────────────────────────────────────────────

type deleteRiskInput struct {
	ID string `path:"id"`
}

type deleteRiskOutput struct {
	Status int
	Body   struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleDeleteRisk(ctx context.Context, in *deleteRiskInput) (*deleteRiskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	riskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("risk.invalid_id", "invalid risk ID")
	}

	r, err := s.GetRisk(ctx, riskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, r.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if err := s.deleteRisk(ctx, riskID); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "risk.delete",
		ResourceType: "risk",
		ResourceID:   riskID.String(),
	})

	out := &deleteRiskOutput{Status: http.StatusOK}
	out.Body.OK = true
	return out, nil
}

// ─── PI review ────────────────────────────────────────────────────────────────

type setPIReviewInput struct {
	ID   string `path:"id"`
	Body struct {
		Flagged bool `json:"flagged"`
	}
}

type setPIReviewOutput struct {
	Body *Risk
}

func (s *Service) handleSetPIReview(ctx context.Context, in *setPIReviewInput) (*setPIReviewOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	riskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("risk.invalid_id", "invalid risk ID")
	}

	r, err := s.GetRisk(ctx, riskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, r.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	updated, err := s.setPIReview(ctx, riskID, in.Body.Flagged)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "risk.pi_review_set",
		ResourceType: "risk",
		ResourceID:   riskID.String(),
	})

	return &setPIReviewOutput{Body: updated}, nil
}
