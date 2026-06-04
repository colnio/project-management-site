package activity

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires activity HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "activity-list",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces/{id}/activity",
		Summary:     "Workspace activity feed",
		Tags:        []string{"activity"},
	}, svc.handleListActivity)
}

// ─── List activity ────────────────────────────────────────────────────────────

type listActivityInput struct {
	ID     string `path:"id"`
	Limit  int    `query:"limit"`
	Before string `query:"before"`
}

type listActivityOutput struct {
	Body []*ActivityItem
}

func (s *Service) handleListActivity(ctx context.Context, in *listActivityInput) (*listActivityOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadActivity); err != nil {
		return nil, err
	}

	wsID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("workspace.invalid_id", "invalid workspace ID")
	}

	// Check workspace membership.
	_, isMember, err := s.org.WorkspaceRole(ctx, wsID, p.UserID)
	if err != nil {
		return nil, err
	}
	if !isMember && !p.IsPrivileged() {
		return nil, platform.Forbidden("not a member of this workspace")
	}

	// Parse optional cursor.
	var before *time.Time
	if in.Before != "" {
		if t, parseErr := time.Parse(time.RFC3339, in.Before); parseErr == nil {
			before = &t
		}
	}

	items, err := s.ListForWorkspace(ctx, p, wsID, in.Limit, before)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []*ActivityItem{}
	}

	return &listActivityOutput{Body: items}, nil
}
