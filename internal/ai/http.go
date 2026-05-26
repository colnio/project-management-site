package ai

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register mounts all huma AI endpoints on the API.
func Register(api huma.API, svc *Service) {
	// Conversations.
	huma.Register(api, huma.Operation{
		OperationID: "ai-create-conversation",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/ai/conversations",
		Summary:     "Create an AI conversation",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *aiCreateConversationInput) (*aiConversationOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		projectID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_project_id", "invalid project id")
		}
		conv, err := svc.CreateConversation(ctx, p, projectID, input.Body.Title)
		if err != nil {
			return nil, err
		}
		return &aiConversationOutput{Body: conv}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "ai-list-conversations",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/ai/conversations",
		Summary:     "List AI conversations for a project",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *aiListConversationsInput) (*aiConversationListOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		projectID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_project_id", "invalid project id")
		}
		convs, err := svc.ListConversations(ctx, p, projectID)
		if err != nil {
			return nil, err
		}
		if convs == nil {
			convs = []*Conversation{}
		}
		return &aiConversationListOutput{Body: struct {
			Items []*Conversation `json:"items"`
		}{Items: convs}}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "ai-get-conversation-messages",
		Method:      http.MethodGet,
		Path:        "/v1/ai/conversations/{id}",
		Summary:     "Get messages for an AI conversation",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *aiConversationMessagesInput) (*aiMessagesOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		convID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_conversation_id", "invalid conversation id")
		}
		msgs, err := svc.GetConversationMessages(ctx, p, convID)
		if err != nil {
			return nil, err
		}
		if msgs == nil {
			msgs = []*Message{}
		}
		return &aiMessagesOutput{Body: struct {
			Items []*Message `json:"items"`
		}{Items: msgs}}, nil
	})

	// Tool call approval / rejection.
	huma.Register(api, huma.Operation{
		OperationID: "ai-approve-tool-call",
		Method:      http.MethodPost,
		Path:        "/v1/ai/conversations/{id}/tool-calls/{tcid}/approve",
		Summary:     "Approve a proposed AI tool call",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *aiToolCallActionInput) (*aiToolCallOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		convID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_conversation_id", "invalid conversation id")
		}
		tcID, err := uuid.Parse(input.TCID)
		if err != nil {
			return nil, platform.BadRequest("invalid_tool_call_id", "invalid tool call id")
		}
		tc, err := svc.ApproveToolCall(ctx, p, convID, tcID)
		if err != nil {
			return nil, err
		}
		return &aiToolCallOutput{Body: tc}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "ai-reject-tool-call",
		Method:      http.MethodPost,
		Path:        "/v1/ai/conversations/{id}/tool-calls/{tcid}/reject",
		Summary:     "Reject a proposed AI tool call",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *aiToolCallActionInput) (*aiToolCallOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		convID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_conversation_id", "invalid conversation id")
		}
		tcID, err := uuid.Parse(input.TCID)
		if err != nil {
			return nil, platform.BadRequest("invalid_tool_call_id", "invalid tool call id")
		}
		tc, err := svc.RejectToolCall(ctx, p, convID, tcID)
		if err != nil {
			return nil, err
		}
		return &aiToolCallOutput{Body: tc}, nil
	})

	// Autonomy endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "ai-get-workspace-autonomy",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces/{id}/autonomy",
		Summary:     "Get workspace AI autonomy config",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *autonomyScopeInput) (*autonomyOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		wsID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_workspace_id", "invalid workspace id")
		}
		cfg, err := svc.GetWorkspaceAutonomy(ctx, p, wsID)
		if err != nil {
			return nil, err
		}
		return &autonomyOutput{Body: cfg}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "ai-put-workspace-autonomy",
		Method:      http.MethodPut,
		Path:        "/v1/workspaces/{id}/autonomy",
		Summary:     "Set workspace AI autonomy config",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *autonomyPutInput) (*autonomyOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		wsID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_workspace_id", "invalid workspace id")
		}
		if err := svc.SetWorkspaceAutonomy(ctx, p, wsID, input.Body.Mode, input.Body.AllowedTools); err != nil {
			return nil, err
		}
		cfg, err := svc.GetWorkspaceAutonomy(ctx, p, wsID)
		if err != nil {
			return nil, err
		}
		return &autonomyOutput{Body: cfg}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "ai-get-project-autonomy",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/autonomy",
		Summary:     "Get project AI autonomy config",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *autonomyScopeInput) (*autonomyOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		projID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_project_id", "invalid project id")
		}
		cfg, err := svc.GetProjectAutonomy(ctx, p, projID)
		if err != nil {
			return nil, err
		}
		return &autonomyOutput{Body: cfg}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "ai-put-project-autonomy",
		Method:      http.MethodPut,
		Path:        "/v1/projects/{id}/autonomy",
		Summary:     "Set project AI autonomy config",
		Tags:        []string{"AI"},
	}, func(ctx context.Context, input *autonomyPutInput) (*autonomyOutput, error) {
		p, ok := platform.PrincipalFrom(ctx)
		if !ok {
			return nil, platform.Unauthorized("authentication required")
		}
		projID, err := uuid.Parse(input.ID)
		if err != nil {
			return nil, platform.BadRequest("invalid_project_id", "invalid project id")
		}
		if err := svc.SetProjectAutonomy(ctx, p, projID, input.Body.Mode, input.Body.AllowedTools); err != nil {
			return nil, err
		}
		cfg, err := svc.GetProjectAutonomy(ctx, p, projID)
		if err != nil {
			return nil, err
		}
		return &autonomyOutput{Body: cfg}, nil
	})
}

// ─── Input/Output types ──────────────────────────────────────────────────────

type aiCreateConversationInput struct {
	ID   string `path:"id"`
	Body struct {
		Title string `json:"title"`
	}
}

type aiConversationOutput struct {
	Body *Conversation
}

type aiListConversationsInput struct {
	ID string `path:"id"`
}

type aiConversationListOutput struct {
	Body struct {
		Items []*Conversation `json:"items"`
	}
}

type aiConversationMessagesInput struct {
	ID string `path:"id"`
}

type aiMessagesOutput struct {
	Body struct {
		Items []*Message `json:"items"`
	}
}

type aiToolCallActionInput struct {
	ID   string `path:"id"`
	TCID string `path:"tcid"`
}

type aiToolCallOutput struct {
	Body *ToolCallRecord
}

type autonomyScopeInput struct {
	ID string `path:"id"`
}

type autonomyPutInput struct {
	ID   string `path:"id"`
	Body struct {
		Mode         string   `json:"mode"`
		AllowedTools []string `json:"allowed_tools"`
	}
}

type autonomyOutput struct {
	Body *AutonomyConfig
}

// ensure org import is used for RoleOwner
var _ = org.RoleOwner
