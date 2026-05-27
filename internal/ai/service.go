package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/risk"
)

// Service is the AI module's domain service.
type Service struct {
	pool     *pgxpool.Pool
	cfg      *config.Config
	client   Client   // nil means AI is disabled
	authSvc  *auth.Service
	projects *project.Service
	risks    *risk.Service // optional; nil if risk module not wired yet
	rec      audit.Recorder
	log      *slog.Logger
	restBase string // http://127.0.0.1:{port}
}

// SetRiskService wires the risk service into the AI service so that completed
// risk-assessment workflow runs can populate the risk register. Call this in
// main.go after both services are constructed.
func (s *Service) SetRiskService(risks *risk.Service) {
	s.risks = risks
}

// NewService constructs the AI service. If client is nil, all AI endpoints
// return 503 ai.unavailable.
func NewService(
	pool *pgxpool.Pool,
	cfg *config.Config,
	client Client,
	authSvc *auth.Service,
	projects *project.Service,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:     pool,
		cfg:      cfg,
		client:   client,
		authSvc:  authSvc,
		projects: projects,
		rec:      rec,
		log:      log,
		restBase: "http://127.0.0.1:" + cfg.Port,
	}
}

// available reports whether the AI client is configured.
func (s *Service) available() bool {
	return s.client != nil
}

func (s *Service) unavailableErr() error {
	return platform.Errorf(503, "ai.unavailable", "AI provider is not configured")
}

// ─── Conversation management ─────────────────────────────────────────────────

// CreateConversation creates a new conversation for a project.
func (s *Service) CreateConversation(ctx context.Context, p *platform.Principal, projectID uuid.UUID, title string) (*Conversation, error) {
	if !s.available() {
		return nil, s.unavailableErr()
	}

	proj, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer)
	if err != nil {
		return nil, err
	}

	conv, err := createConversation(ctx, s.pool, proj.ID, p.UserID, title)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:               p.UserID,
		ViaAIConversationID: p.ViaAIConversationID,
		Action:              "ai.conversation_create",
		ResourceType:        "ai_conversation",
		ResourceID:          conv.ID.String(),
	})

	return conv, nil
}

// ListConversations returns all conversations for a project.
func (s *Service) ListConversations(ctx context.Context, p *platform.Principal, projectID uuid.UUID) ([]*Conversation, error) {
	if !s.available() {
		return nil, s.unavailableErr()
	}
	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}
	return listConversations(ctx, s.pool, projectID)
}

// GetConversationMessages returns all messages for a conversation.
func (s *Service) GetConversationMessages(ctx context.Context, p *platform.Principal, convID uuid.UUID) ([]*Message, error) {
	if !s.available() {
		return nil, s.unavailableErr()
	}
	conv, err := getConversation(ctx, s.pool, convID)
	if err != nil {
		return nil, err
	}
	if conv == nil {
		return nil, platform.NotFound("ai.conversation_not_found", "conversation not found")
	}
	if _, _, err := s.projects.Authorize(ctx, p, conv.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}
	return listMessages(ctx, s.pool, convID)
}

// ─── Tool call approval/rejection ────────────────────────────────────────────

// ApproveToolCall executes a proposed tool call.
func (s *Service) ApproveToolCall(ctx context.Context, p *platform.Principal, convID, tcID uuid.UUID) (*ToolCallRecord, error) {
	if !s.available() {
		return nil, s.unavailableErr()
	}

	conv, err := getConversation(ctx, s.pool, convID)
	if err != nil || conv == nil {
		return nil, platform.NotFound("ai.conversation_not_found", "conversation not found")
	}
	proj, _, err := s.projects.Authorize(ctx, p, conv.ProjectID, org.RoleEditor)
	if err != nil {
		return nil, err
	}

	tc, err := getToolCall(ctx, s.pool, tcID)
	if err != nil || tc == nil {
		return nil, platform.NotFound("ai.tool_call_not_found", "tool call not found")
	}
	if tc.Status != "proposed" {
		return nil, platform.BadRequest("ai.tool_call_not_proposed", "tool call is not in proposed state")
	}

	// Mint an internal token to execute the call.
	iaiToken, err := s.authSvc.MintInternalAIToken(ctx, p.UserID, convID, []string{"tools:write"}, nil)
	if err != nil {
		return nil, fmt.Errorf("ai: mint token for approval: %w", err)
	}
	defer func() { _ = s.authSvc.RevokeInternalAITokens(ctx, convID) }()

	restCall := makeRESTCaller(s.restBase, iaiToken)

	inputJSON, _ := json.Marshal(tc.InputJSON)
	result, _, execErr := dispatchTool(ctx, tc.Tool, string(inputJSON), proj.ID.String(), proj.WorkspaceID.String(), restCall)

	status := "executed"
	if execErr != nil {
		status = "rejected"
	}
	outputJSON, _ := json.Marshal(map[string]any{"result": result, "error": execErr})
	executedBy := p.UserID
	if err := updateToolCallOutput(ctx, s.pool, tcID, outputJSON, status, &executedBy); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:               p.UserID,
		ViaAIConversationID: &convID,
		Action:              "ai.tool_call_approve",
		ResourceType:        "ai_tool_call",
		ResourceID:          tcID.String(),
	})

	tc.Status = status
	return tc, execErr
}

// RejectToolCall marks a proposed tool call as rejected.
func (s *Service) RejectToolCall(ctx context.Context, p *platform.Principal, convID, tcID uuid.UUID) (*ToolCallRecord, error) {
	if !s.available() {
		return nil, s.unavailableErr()
	}

	conv, err := getConversation(ctx, s.pool, convID)
	if err != nil || conv == nil {
		return nil, platform.NotFound("ai.conversation_not_found", "conversation not found")
	}
	if _, _, err := s.projects.Authorize(ctx, p, conv.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	tc, err := getToolCall(ctx, s.pool, tcID)
	if err != nil || tc == nil {
		return nil, platform.NotFound("ai.tool_call_not_found", "tool call not found")
	}
	if tc.Status != "proposed" {
		return nil, platform.BadRequest("ai.tool_call_not_proposed", "tool call is not in proposed state")
	}

	executedBy := p.UserID
	if err := updateToolCallOutput(ctx, s.pool, tcID, json.RawMessage(`null`), "rejected", &executedBy); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:               p.UserID,
		ViaAIConversationID: &convID,
		Action:              "ai.tool_call_reject",
		ResourceType:        "ai_tool_call",
		ResourceID:          tcID.String(),
	})

	tc.Status = "rejected"
	return tc, nil
}

// ─── Autonomy endpoints ──────────────────────────────────────────────────────

// GetWorkspaceAutonomy returns the autonomy config for a workspace.
func (s *Service) GetWorkspaceAutonomy(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID) (*AutonomyConfig, error) {
	return GetAutonomy(ctx, s.pool, "workspace", workspaceID)
}

// SetWorkspaceAutonomy upserts the autonomy config for a workspace.
func (s *Service) SetWorkspaceAutonomy(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID, mode string, allowedTools []string) error {
	return UpsertAutonomy(ctx, s.pool, "workspace", workspaceID, mode, allowedTools)
}

// GetProjectAutonomy returns the autonomy config for a project.
func (s *Service) GetProjectAutonomy(ctx context.Context, p *platform.Principal, projectID uuid.UUID) (*AutonomyConfig, error) {
	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleOwner); err != nil {
		return nil, err
	}
	return GetAutonomy(ctx, s.pool, "project", projectID)
}

// GetUsageSummary returns spend metrics for a workspace.
func (s *Service) GetUsageSummary(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID) (*UsageSummary, error) {
	// Reuse the same lightweight auth as GetWorkspaceAutonomy — no role required
	// beyond being authenticated (any workspace member can view spend data).
	return getUsageSummary(ctx, s.pool, workspaceID)
}

// ─── ListProposedToolCallsByWorkspace ─────────────────────────────────────────

// ProposedToolCallItem is a lightweight view of a proposed AI tool call.
type ProposedToolCallItem struct {
	ID        uuid.UUID
	Tool      string
	ProjectID uuid.UUID
	CreatedAt time.Time
}

// ListProposedToolCallsByWorkspace returns proposed AI tool calls for all projects
// in the given workspace, ordered by created_at DESC, limited to limit rows.
func (s *Service) ListProposedToolCallsByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]ProposedToolCallItem, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT tc.id, tc.tool, tc.created_at, p.id AS project_id
		 FROM ai_tool_calls tc
		 JOIN ai_conversations c ON c.id = tc.conversation_id
		 JOIN projects p ON p.id = c.project_id
		 WHERE p.workspace_id = $1
		   AND tc.status = 'proposed'
		 ORDER BY tc.created_at DESC
		 LIMIT $2`,
		workspaceID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("ai: list proposed tool calls by workspace: %w", err)
	}
	defer rows.Close()

	var items []ProposedToolCallItem
	for rows.Next() {
		var item ProposedToolCallItem
		if err := rows.Scan(&item.ID, &item.Tool, &item.CreatedAt, &item.ProjectID); err != nil {
			return nil, fmt.Errorf("ai: scan proposed tool call: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ai: proposed tool calls rows: %w", err)
	}
	return items, nil
}

// SetProjectAutonomy upserts the autonomy config for a project.
func (s *Service) SetProjectAutonomy(ctx context.Context, p *platform.Principal, projectID uuid.UUID, mode string, allowedTools []string) error {
	proj, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleOwner)
	if err != nil {
		return err
	}
	// Get workspace autonomy and clamp.
	wsMode, wsTools := loadAutonomy(ctx, s.pool, "workspace", proj.WorkspaceID)
	if wsMode != "" {
		mode = minMode(mode, wsMode)
		allowedTools = intersectTools(wsTools, allowedTools)
	}
	return UpsertAutonomy(ctx, s.pool, "project", projectID, mode, allowedTools)
}
