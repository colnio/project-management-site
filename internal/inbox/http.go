package inbox

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires inbox HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "inbox-list",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces/{id}/inbox",
		Summary:     "Workspace inbox",
		Description: "Returns an aggregated feed of actionable items for the workspace: PI-flagged risks, pending AI proposals, and recent audit activity. Capped at 50 items, ordered newest-first. Requires workspace membership.",
		Tags:        []string{"inbox"},
	}, svc.handleListInbox)
}

// ─── List inbox ───────────────────────────────────────────────────────────────

type listInboxInput struct {
	ID string `path:"id"`
}

type listInboxOutput struct {
	Body []Item
}

func (s *Service) handleListInbox(ctx context.Context, in *listInboxInput) (*listInboxOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadInbox); err != nil {
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

	items, err := s.AggregateForWorkspace(ctx, wsID)
	if err != nil {
		return nil, err
	}

	return &listInboxOutput{Body: items}, nil
}
