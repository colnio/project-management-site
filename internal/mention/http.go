package mention

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires mention HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "mention-create",
		Method:      http.MethodPost,
		Path:        "/v1/mentions",
		Summary:     "Create a mention",
		Description: "Records that the authenticated user @-mentioned another user within a task or page, and dispatches a notification email. Duplicate mentions (same mentioned user + source) are silently ignored.",
		Tags:        []string{"mentions"},
	}, svc.handleCreate)
}

// ─── POST /v1/mentions ───────────────────────────────────────────────────────

type createMentionBody struct {
	MentionedUserID string `json:"mentioned_user_id" required:"true" doc:"UUID of the user being mentioned"`
	SourceType      string `json:"source_type"      required:"true" enum:"task,page" doc:"Whether the mention originates in a task or a page"`
	SourceID        string `json:"source_id"        required:"true" doc:"UUID of the task or page containing the mention"`
	ProjectID       string `json:"project_id,omitempty"   doc:"Project context (optional)"`
	WorkspaceID     string `json:"workspace_id,omitempty" doc:"Workspace context (optional)"`
	Link            string `json:"link,omitempty"         doc:"Deep link to the mention in the UI"`
	Snippet         string `json:"snippet,omitempty"      doc:"Short text excerpt surrounding the mention"`
}

type createMentionInput struct {
	Body createMentionBody
}

type createMentionOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleCreate(ctx context.Context, in *createMentionInput) (*createMentionOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	// Parse required UUIDs.
	mentionedUserID, err := uuid.Parse(in.Body.MentionedUserID)
	if err != nil {
		return nil, platform.BadRequest("mention.invalid_mentioned_user_id", "mentioned_user_id must be a valid UUID")
	}
	sourceID, err := uuid.Parse(in.Body.SourceID)
	if err != nil {
		return nil, platform.BadRequest("mention.invalid_source_id", "source_id must be a valid UUID")
	}

	// Parse optional UUIDs; ignore parse errors (treat as nil context).
	var projectID *uuid.UUID
	if in.Body.ProjectID != "" {
		if id, perr := uuid.Parse(in.Body.ProjectID); perr == nil {
			projectID = &id
		}
	}
	var workspaceID *uuid.UUID
	if in.Body.WorkspaceID != "" {
		if id, perr := uuid.Parse(in.Body.WorkspaceID); perr == nil {
			workspaceID = &id
		}
	}

	if err := s.Create(
		ctx,
		p.UserID,
		mentionedUserID,
		in.Body.SourceType,
		sourceID,
		projectID,
		workspaceID,
		in.Body.Link,
		in.Body.Snippet,
	); err != nil {
		return nil, err
	}

	out := &createMentionOutput{}
	out.Body.OK = true
	return out, nil
}
