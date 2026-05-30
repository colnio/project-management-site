package audit

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/platform"
)

// Service wraps the PgRecorder and exposes it through HTTP endpoints.
type Service struct {
	rec *PgRecorder
}

// NewService constructs an audit Service backed by the given recorder.
func NewService(rec *PgRecorder) *Service {
	return &Service{rec: rec}
}

// GetAuditInput holds the query parameters for GET /v1/audit.
type GetAuditInput struct {
	Actor        string `query:"actor"         doc:"Filter by actor UUID (optional)"`
	ResourceType string `query:"resource_type" doc:"Filter by resource type (optional)"`
	ResourceID   string `query:"resource_id"   doc:"Filter by resource ID (optional)"`
	Limit        int    `query:"limit"         doc:"Max entries to return (default 50, max 200)"`
	Cursor       string `query:"cursor"        doc:"Opaque pagination cursor from a previous response"`
}

// AuditEntryView is the JSON-serialisable form of an audit Entry.
type AuditEntryView struct {
	Actor                string     `json:"actor"`
	ViaTokenID           *uuid.UUID `json:"via_token_id,omitempty"`
	ViaAIConversationID  *uuid.UUID `json:"via_ai_conversation_id,omitempty"`
	Action               string     `json:"action"`
	ResourceType         string     `json:"resource_type"`
	ResourceID           string     `json:"resource_id"`
	RequestPayloadDigest string     `json:"request_payload_digest,omitempty"`
	ResponseStatus       int        `json:"response_status"`
	CreatedAt            time.Time  `json:"created_at"`

	// Display-time enrichment: resolved workspace/project context.
	// Populated on the read path; never stored in audit_log.
	ProjectID     string `json:"project_id,omitempty"`
	ProjectName   string `json:"project_name,omitempty"`
	WorkspaceName string `json:"workspace_name,omitempty"`
}

// GetAuditOutput is the response body for GET /v1/audit.
type GetAuditOutput struct {
	Body struct {
		Items      []AuditEntryView `json:"items"`
		NextCursor string           `json:"next_cursor,omitempty"`
	}
}

// Register wires the audit HTTP endpoints onto the given huma.API.
// Call this from the orchestrator (cmd/api/main.go), not from within this package.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "list-audit",
		Method:      http.MethodGet,
		Path:        "/v1/audit",
		Summary:     "List audit log entries",
		Description: "Returns a cursor-paginated list of immutable audit log entries. Supports filtering by `actor`, `resource_type`, and `resource_id`. Requires system-admin role; token-scoped callers must also carry the `read:audit` scope.",
		Tags:        []string{"audit"},
	}, svc.HandleListAudit)
}

// HandleListAudit is exported so it can be called directly in package tests
// without requiring an HTTP server. The same function is wired into huma by Register.
func (svc *Service) HandleListAudit(ctx context.Context, in *GetAuditInput) (*GetAuditOutput, error) {
	principal, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("authentication required")
	}
	if !principal.IsPrivileged() {
		return nil, platform.Forbidden("audit log requires privileged role (admin or PI)")
	}
	if err := platform.RequireScope(principal, platform.ScopeReadAudit); err != nil {
		return nil, err
	}

	f := ListFilter{
		ResourceType: in.ResourceType,
		ResourceID:   in.ResourceID,
		Limit:        in.Limit,
		Cursor:       in.Cursor,
	}
	if in.Actor != "" {
		id, err := uuid.Parse(in.Actor)
		if err != nil {
			return nil, platform.BadRequest("audit.invalid_actor", "actor must be a valid UUID")
		}
		f.Actor = &id
	}

	entries, nextCursor, err := svc.rec.List(ctx, f)
	if err != nil {
		return nil, platform.Errorf(http.StatusInternalServerError, "audit.list_failed", "failed to list audit entries")
	}

	resolver := newContextResolver(svc.rec.pool)

	out := &GetAuditOutput{}
	out.Body.NextCursor = nextCursor
	out.Body.Items = make([]AuditEntryView, len(entries))
	for i, e := range entries {
		rctx := resolver.Resolve(ctx, e.ResourceType, e.ResourceID)
		out.Body.Items[i] = AuditEntryView{
			Actor:                e.Actor.String(),
			ViaTokenID:           e.ViaTokenID,
			ViaAIConversationID:  e.ViaAIConversationID,
			Action:               e.Action,
			ResourceType:         e.ResourceType,
			ResourceID:           e.ResourceID,
			RequestPayloadDigest: e.RequestPayloadDigest,
			ResponseStatus:       e.ResponseStatus,
			CreatedAt:            e.CreatedAt,
			ProjectID:            rctx.ProjectID,
			ProjectName:          rctx.ProjectName,
			WorkspaceName:        rctx.WorkspaceName,
		}
	}
	return out, nil
}
