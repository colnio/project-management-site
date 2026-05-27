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
	orgSvc   *org.Service
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
	orgSvc *org.Service,
	projects *project.Service,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:     pool,
		cfg:      cfg,
		client:   client,
		authSvc:  authSvc,
		orgSvc:   orgSvc,
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
// skill is an optional skill name (the bare filename without .md) to inject
// as the system prompt when the conversation receives its first message.
func (s *Service) CreateConversation(ctx context.Context, p *platform.Principal, projectID uuid.UUID, title string, skill *string) (*Conversation, error) {
	if !s.available() {
		return nil, s.unavailableErr()
	}

	proj, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer)
	if err != nil {
		return nil, err
	}

	conv, err := createConversation(ctx, s.pool, proj.ID, p.UserID, title, skill)
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
	iaiToken, err := s.authSvc.MintInternalAIToken(ctx, p.UserID, convID, []string{
		platform.ScopeReadProjects,
		platform.ScopeReadSamples,
		platform.ScopeReadExperiments,
		platform.ScopeReadPages,
		platform.ScopeReadArtifacts,
		platform.ScopeWritePages,
		platform.ScopeWriteIterations,
		platform.ScopeWriteCalendar,
	}, nil)
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
// Requires workspace membership.
func (s *Service) GetWorkspaceAutonomy(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID) (*AutonomyConfig, error) {
	if err := s.checkWorkspaceMember(ctx, p, workspaceID); err != nil {
		return nil, err
	}
	return GetAutonomy(ctx, s.pool, "workspace", workspaceID)
}

// SetWorkspaceAutonomy upserts the autonomy config for a workspace.
// Requires workspace owner role. Emits an audit entry.
func (s *Service) SetWorkspaceAutonomy(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID, mode string, allowedTools []string) error {
	role, isMember, err := s.orgSvc.WorkspaceRole(ctx, workspaceID, p.UserID)
	if err != nil {
		return err
	}
	if !isMember && !p.IsPrivileged() {
		return platform.Forbidden("not a member of this workspace")
	}
	if role != string(org.RoleOwner) && !p.IsPrivileged() {
		return platform.Forbidden("workspace owner role required to update autonomy config")
	}
	if err := UpsertAutonomy(ctx, s.pool, "workspace", workspaceID, mode, allowedTools); err != nil {
		return err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "ai.workspace_autonomy.update",
		ResourceType: "workspace",
		ResourceID:   workspaceID.String(),
	})
	return nil
}

// GetProjectAutonomy returns the autonomy config for a project.
func (s *Service) GetProjectAutonomy(ctx context.Context, p *platform.Principal, projectID uuid.UUID) (*AutonomyConfig, error) {
	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleOwner); err != nil {
		return nil, err
	}
	return GetAutonomy(ctx, s.pool, "project", projectID)
}

// GetUsageSummary returns spend metrics for a workspace.
// Requires workspace membership.
func (s *Service) GetUsageSummary(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID) (*UsageSummary, error) {
	if err := s.checkWorkspaceMember(ctx, p, workspaceID); err != nil {
		return nil, err
	}
	return getUsageSummary(ctx, s.pool, workspaceID)
}

// checkWorkspaceMember returns a Forbidden error if the principal is not a
// member of the workspace (and not a privileged user).
func (s *Service) checkWorkspaceMember(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID) error {
	_, isMember, err := s.orgSvc.WorkspaceRole(ctx, workspaceID, p.UserID)
	if err != nil {
		return err
	}
	if !isMember && !p.IsPrivileged() {
		return platform.Forbidden("not a member of this workspace")
	}
	return nil
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

// ─── Risk review ─────────────────────────────────────────────────────────────

// ReviewRisks calls the AI to summarise the risk register for a project (or
// an iteration within it) and return a concise readiness recommendation.
// The caller is authorised as Viewer; no write scopes are required.
func (s *Service) ReviewRisks(ctx context.Context, p *platform.Principal, projectID uuid.UUID, iterationID *uuid.UUID) (string, error) {
	if !s.available() {
		return "", s.unavailableErr()
	}
	if s.risks == nil {
		return "", platform.Errorf(503, "ai.risks_unavailable", "risk service is not wired")
	}

	proj, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer)
	if err != nil {
		return "", err
	}

	risks, err := s.risks.ListForReview(ctx, projectID, iterationID)
	if err != nil {
		return "", fmt.Errorf("ai: review risks: %w", err)
	}

	// Build a bullet list of risks for the user message.
	var riskLines []string
	for _, r := range risks {
		iterStr := ""
		if r.IterationID != nil {
			iterStr = fmt.Sprintf(" [iter:%s]", r.IterationID.String())
		}
		riskLines = append(riskLines, fmt.Sprintf("- %s | likelihood:%s | impact:%s | status:%s%s",
			r.Title, r.Likelihood, r.ImpactHeadline, r.Status, iterStr))
	}
	riskBullets := ""
	for _, l := range riskLines {
		riskBullets += l + "\n"
	}

	iterMsg := ""
	if iterationID != nil {
		iterMsg = fmt.Sprintf("\nIteration: %s", iterationID.String())
	}

	userMsg := fmt.Sprintf(
		"Project: %s (id: %s)%s\nDate: %s\n\nRisk Register:\n%s",
		proj.Name,
		proj.ID.String(),
		iterMsg,
		time.Now().Format("2006-01-02"),
		riskBullets,
	)

	systemMsg := "You are a scientific risk assessment reviewer. Summarise the risk register, identify the top concerns, and give a concise readiness recommendation."

	resp, err := s.client.Chat(ctx, ChatRequest{
		Messages: []ChatMessage{
			{Role: "system", Content: systemMsg},
			{Role: "user", Content: userMsg},
		},
		MaxTokens: 1024,
	})
	if err != nil {
		return "", fmt.Errorf("ai: review risks: chat: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "ai.risk_review",
		ResourceType: "project",
		ResourceID:   projectID.String(),
	})

	return resp.Message.Content, nil
}
