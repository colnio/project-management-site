package meeting

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires meeting HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "meeting-create",
		Method:      http.MethodPost,
		Path:        "/v1/workspaces/{id}/meetings",
		Summary:     "Create a meeting",
		Description: "Creates a new meeting record in the workspace. Optionally linked to a project. Requires workspace membership.",
		Tags:        []string{"meetings"},
	}, svc.handleCreateMeeting)

	huma.Register(api, huma.Operation{
		OperationID: "meeting-list",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces/{id}/meetings",
		Summary:     "List meetings in a workspace",
		Description: "Returns all meetings in the workspace ordered by start_at descending. Requires workspace membership.",
		Tags:        []string{"meetings"},
	}, svc.handleListMeetings)

	huma.Register(api, huma.Operation{
		OperationID: "meeting-get",
		Method:      http.MethodGet,
		Path:        "/v1/meetings/{id}",
		Summary:     "Get a meeting",
		Description: "Returns a single meeting by ID. Requires workspace membership.",
		Tags:        []string{"meetings"},
	}, svc.handleGetMeeting)

	huma.Register(api, huma.Operation{
		OperationID: "meeting-patch",
		Method:      http.MethodPatch,
		Path:        "/v1/meetings/{id}",
		Summary:     "Update a meeting",
		Description: "Applies a partial update to a meeting. Requires workspace membership.",
		Tags:        []string{"meetings"},
	}, svc.handlePatchMeeting)

	huma.Register(api, huma.Operation{
		OperationID: "meeting-delete",
		Method:      http.MethodDelete,
		Path:        "/v1/meetings/{id}",
		Summary:     "Delete a meeting",
		Description: "Deletes a meeting. Requires workspace membership.",
		Tags:        []string{"meetings"},
	}, svc.handleDeleteMeeting)
}

// ─── Create meeting ───────────────────────────────────────────────────────────

type createMeetingInput struct {
	ID   string `path:"id"`
	Body struct {
		Title       string          `json:"title" required:"true" minLength:"1"`
		Kind        string          `json:"kind,omitempty" enum:"sync,review,planning,retro,other"`
		ProjectID   string          `json:"project_id,omitempty"`
		Chair       string          `json:"chair,omitempty"`
		StartAt     time.Time       `json:"start_at" required:"true"`
		EndAt       *time.Time      `json:"end_at,omitempty"`
		Location    string          `json:"location,omitempty"`
		Agenda      string          `json:"agenda,omitempty"`
		Notes       string          `json:"notes,omitempty"`
		Attendees   json.RawMessage `json:"attendees,omitempty"`
		Decisions   json.RawMessage `json:"decisions,omitempty"`
		ActionItems json.RawMessage `json:"action_items,omitempty"`
	}
}

type createMeetingOutput struct {
	Status int
	Body   *Meeting
}

func (s *Service) handleCreateMeeting(ctx context.Context, in *createMeetingInput) (*createMeetingOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	wsID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("workspace.invalid_id", "invalid workspace ID")
	}

	if err := s.checkWorkspaceMember(ctx, p, wsID); err != nil {
		return nil, err
	}

	var projectID *uuid.UUID
	if in.Body.ProjectID != "" {
		pid, err := uuid.Parse(in.Body.ProjectID)
		if err != nil {
			return nil, platform.BadRequest("meeting.invalid_project_id", "invalid project ID")
		}
		projectID = &pid
		// Verify the project belongs to this workspace.
		proj, err := s.projects.GetProject(ctx, pid)
		if err != nil {
			return nil, err
		}
		if proj.WorkspaceID != wsID {
			return nil, platform.BadRequest("meeting.project_mismatch", "project does not belong to this workspace")
		}
	}

	var chair *uuid.UUID
	if in.Body.Chair != "" {
		cid, err := uuid.Parse(in.Body.Chair)
		if err != nil {
			return nil, platform.BadRequest("meeting.invalid_chair", "invalid chair user ID")
		}
		chair = &cid
	}

	m, err := s.createMeeting(ctx, wsID, projectID,
		in.Body.Title, in.Body.Kind, chair,
		in.Body.StartAt, in.Body.EndAt,
		in.Body.Location, in.Body.Agenda, in.Body.Notes,
		in.Body.Attendees, in.Body.Decisions, in.Body.ActionItems,
		p.UserID,
	)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "meeting.create",
		ResourceType: "meeting",
		ResourceID:   m.ID.String(),
	})

	return &createMeetingOutput{Status: http.StatusCreated, Body: m}, nil
}

// ─── List meetings ────────────────────────────────────────────────────────────

type listMeetingsInput struct {
	ID string `path:"id"`
}

type listMeetingsOutput struct {
	Body []*Meeting
}

func (s *Service) handleListMeetings(ctx context.Context, in *listMeetingsInput) (*listMeetingsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	wsID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("workspace.invalid_id", "invalid workspace ID")
	}

	if err := s.checkWorkspaceMember(ctx, p, wsID); err != nil {
		return nil, err
	}

	list, err := s.listByWorkspace(ctx, wsID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Meeting{}
	}
	return &listMeetingsOutput{Body: list}, nil
}

// ─── Get meeting ──────────────────────────────────────────────────────────────

type getMeetingInput struct {
	ID string `path:"id"`
}

type getMeetingOutput struct {
	Body *Meeting
}

func (s *Service) handleGetMeeting(ctx context.Context, in *getMeetingInput) (*getMeetingOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	id, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("meeting.invalid_id", "invalid meeting ID")
	}

	m, err := s.GetMeeting(ctx, id)
	if err != nil {
		return nil, err
	}

	if err := s.checkWorkspaceMember(ctx, p, m.WorkspaceID); err != nil {
		return nil, err
	}

	return &getMeetingOutput{Body: m}, nil
}

// ─── Patch meeting ────────────────────────────────────────────────────────────

type patchMeetingInput struct {
	ID   string `path:"id"`
	Body struct {
		Title       *string         `json:"title,omitempty"`
		Kind        *string         `json:"kind,omitempty"`
		Location    *string         `json:"location,omitempty"`
		Agenda      *string         `json:"agenda,omitempty"`
		Notes       *string         `json:"notes,omitempty"`
		StartAt     *time.Time      `json:"start_at,omitempty"`
		Attendees   json.RawMessage `json:"attendees,omitempty"`
		Decisions   json.RawMessage `json:"decisions,omitempty"`
		ActionItems json.RawMessage `json:"action_items,omitempty"`
	}
}

type patchMeetingOutput struct {
	Body *Meeting
}

func (s *Service) handlePatchMeeting(ctx context.Context, in *patchMeetingInput) (*patchMeetingOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	id, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("meeting.invalid_id", "invalid meeting ID")
	}

	m, err := s.GetMeeting(ctx, id)
	if err != nil {
		return nil, err
	}

	if err := s.checkWorkspaceMember(ctx, p, m.WorkspaceID); err != nil {
		return nil, err
	}

	updated, err := s.patchMeeting(ctx, id,
		in.Body.Title, in.Body.Kind, in.Body.Location, in.Body.Agenda, in.Body.Notes,
		nil,  // chair — not exposed in patch for simplicity
		in.Body.StartAt,
		nil,  // endAt — not exposed in patch for simplicity
		in.Body.Attendees, in.Body.Decisions, in.Body.ActionItems,
	)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "meeting.update",
		ResourceType: "meeting",
		ResourceID:   updated.ID.String(),
	})

	return &patchMeetingOutput{Body: updated}, nil
}

// ─── Delete meeting ───────────────────────────────────────────────────────────

type deleteMeetingInput struct {
	ID string `path:"id"`
}

type deleteMeetingOutput struct {
	Status int
	Body   struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleDeleteMeeting(ctx context.Context, in *deleteMeetingInput) (*deleteMeetingOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	id, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("meeting.invalid_id", "invalid meeting ID")
	}

	m, err := s.GetMeeting(ctx, id)
	if err != nil {
		return nil, err
	}

	if err := s.checkWorkspaceMember(ctx, p, m.WorkspaceID); err != nil {
		return nil, err
	}

	if err := s.deleteMeeting(ctx, id); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "meeting.delete",
		ResourceType: "meeting",
		ResourceID:   id.String(),
	})

	out := &deleteMeetingOutput{Status: http.StatusOK}
	out.Body.OK = true
	return out, nil
}
