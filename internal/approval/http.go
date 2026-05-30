package approval

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires approval HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "approval-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/approval-requests",
		Summary:     "Create an approval request",
		Description: "Creates a new approval request for a project. Requires project editor access.",
		Tags:        []string{"approvals"},
	}, svc.handleCreate)

	huma.Register(api, huma.Operation{
		OperationID: "approval-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/approval-requests",
		Summary:     "List approval requests for a project",
		Description: "Returns all approval requests for a project ordered newest-first.",
		Tags:        []string{"approvals"},
	}, svc.handleList)

	huma.Register(api, huma.Operation{
		OperationID: "approval-decide",
		Method:      http.MethodPost,
		Path:        "/v1/approval-requests/{id}/decide",
		Summary:     "Decide on an approval request",
		Description: "Approves or rejects a pending approval request. Caller must be a recipient or project editor.",
		Tags:        []string{"approvals"},
	}, svc.handleDecide)

	huma.Register(api, huma.Operation{
		OperationID: "approval-list-comments",
		Method:      http.MethodGet,
		Path:        "/v1/approval-requests/{id}/comments",
		Summary:     "List comments on an approval request",
		Description: "Returns all comments on an approval request ordered oldest-first. Caller must be a recipient or project member.",
		Tags:        []string{"approvals"},
	}, svc.handleListComments)

	huma.Register(api, huma.Operation{
		OperationID: "approval-create-comment",
		Method:      http.MethodPost,
		Path:        "/v1/approval-requests/{id}/comments",
		Summary:     "Post a comment on an approval request",
		Description: "Posts a threaded review comment on an approval request. Any project participant may comment.",
		Tags:        []string{"approvals"},
	}, svc.handleCreateComment)
}

// ─── Create ───────────────────────────────────────────────────────────────────

type createApprovalInput struct {
	ID   string `path:"id"`
	Body struct {
		IterationID      *string  `json:"iteration_id,omitempty"`
		Description      string   `json:"description" required:"true" minLength:"1"`
		AIReview         string   `json:"ai_review"`
		RecipientUserIDs []string `json:"recipient_user_ids"`
	}
}

type createApprovalOutput struct {
	Status int
	Body   *ApprovalRequest
}

func (s *Service) handleCreate(ctx context.Context, in *createApprovalInput) (*createApprovalOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteApprovals); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("approval.invalid_project_id", "invalid project ID")
	}

	var iterationID *uuid.UUID
	if in.Body.IterationID != nil && *in.Body.IterationID != "" {
		id, err := uuid.Parse(*in.Body.IterationID)
		if err != nil {
			return nil, platform.BadRequest("approval.invalid_iteration_id", "invalid iteration ID")
		}
		iterationID = &id
	}

	var recipientIDs []uuid.UUID
	for _, s := range in.Body.RecipientUserIDs {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, platform.BadRequest("approval.invalid_recipient_id", "invalid recipient user ID: "+s)
		}
		recipientIDs = append(recipientIDs, id)
	}

	ar, err := s.Create(ctx, p, projectID, iterationID, in.Body.Description, in.Body.AIReview, recipientIDs)
	if err != nil {
		return nil, err
	}

	return &createApprovalOutput{Status: http.StatusCreated, Body: ar}, nil
}

// ─── List ─────────────────────────────────────────────────────────────────────

type listApprovalsInput struct {
	ID string `path:"id"`
}

type listApprovalsOutput struct {
	Body struct {
		Items []*ApprovalRequest `json:"items"`
	}
}

func (s *Service) handleList(ctx context.Context, in *listApprovalsInput) (*listApprovalsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadApprovals); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("approval.invalid_project_id", "invalid project ID")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	items, err := s.ListByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []*ApprovalRequest{}
	}

	out := &listApprovalsOutput{}
	out.Body.Items = items
	return out, nil
}

// ─── Decide ───────────────────────────────────────────────────────────────────

type decideApprovalInput struct {
	ID   string `path:"id"`
	Body struct {
		Approve bool `json:"approve"`
	}
}

type decideApprovalOutput struct {
	Body struct {
		Status string `json:"status"`
	}
}

func (s *Service) handleDecide(ctx context.Context, in *decideApprovalInput) (*decideApprovalOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteApprovals); err != nil {
		return nil, err
	}

	requestID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("approval.invalid_id", "invalid approval request ID")
	}

	if err := s.Decide(ctx, p, requestID, in.Body.Approve); err != nil {
		return nil, err
	}

	newStatus := "rejected"
	if in.Body.Approve {
		newStatus = "approved"
	}

	out := &decideApprovalOutput{}
	out.Body.Status = newStatus
	return out, nil
}

// ─── List Comments ────────────────────────────────────────────────────────────

type listCommentsInput struct {
	ID string `path:"id"`
}

type listCommentsOutput struct {
	Body struct {
		Items []*Comment `json:"items"`
	}
}

func (s *Service) handleListComments(ctx context.Context, in *listCommentsInput) (*listCommentsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadApprovals); err != nil {
		return nil, err
	}

	requestID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("approval.invalid_id", "invalid approval request ID")
	}

	items, err := s.ListComments(ctx, p, requestID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []*Comment{}
	}

	out := &listCommentsOutput{}
	out.Body.Items = items
	return out, nil
}

// ─── Create Comment ───────────────────────────────────────────────────────────

type createCommentInput struct {
	ID   string `path:"id"`
	Body struct {
		Body string `json:"body" required:"true" minLength:"1"`
	}
}

type createCommentOutput struct {
	Status int
	Body   *Comment
}

func (s *Service) handleCreateComment(ctx context.Context, in *createCommentInput) (*createCommentOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteApprovals); err != nil {
		return nil, err
	}

	requestID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("approval.invalid_id", "invalid approval request ID")
	}

	c, err := s.CreateComment(ctx, p, requestID, in.Body.Body)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "approval.comment_create",
		ResourceType: "approval_request",
		ResourceID:   requestID.String(),
	})

	return &createCommentOutput{Status: http.StatusCreated, Body: c}, nil
}
