package feedback

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires the feedback HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "feedback-submit",
		Method:      http.MethodPost,
		Path:        "/v1/feedback",
		Summary:     "Submit feedback",
		Description: "Any authenticated user may submit feedback.",
		Tags:        []string{"feedback"},
	}, svc.handleSubmit)

	huma.Register(api, huma.Operation{
		OperationID: "feedback-list",
		Method:      http.MethodGet,
		Path:        "/v1/admin/feedback",
		Summary:     "List submitted feedback",
		Description: "Returns submitted feedback newest-first. Requires admin or PI global role.",
		Tags:        []string{"admin", "feedback"},
	}, svc.handleList)

	huma.Register(api, huma.Operation{
		OperationID: "feedback-acknowledge",
		Method:      http.MethodPost,
		Path:        "/v1/admin/feedback/{id}/acknowledge",
		Summary:     "Acknowledge a feedback entry",
		Description: "Marks feedback as acknowledged, hiding it from the default list while keeping it in the DB. Requires admin or PI global role.",
		Tags:        []string{"admin", "feedback"},
	}, svc.handleAcknowledge)
}

// ─── Submit ──────────────────────────────────────────────────────────────────

var validCategories = map[string]bool{"bug": true, "idea": true, "other": true}

type submitInput struct {
	Body struct {
		Category string `json:"category"`
		Message  string `json:"message"`
	}
}

type submitOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleSubmit(ctx context.Context, in *submitInput) (*submitOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	msg := strings.TrimSpace(in.Body.Message)
	if msg == "" {
		return nil, platform.BadRequest("feedback.empty_message", "message is required")
	}
	if len(msg) > 5000 {
		return nil, platform.BadRequest("feedback.message_too_long", "message must be 5000 characters or fewer")
	}
	category := in.Body.Category
	if category == "" {
		category = "other"
	}
	if !validCategories[category] {
		return nil, platform.BadRequest("feedback.invalid_category", "category must be one of: bug, idea, other")
	}

	f, err := s.Create(ctx, p.UserID, category, msg)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "feedback.submit",
		ResourceType: "feedback",
		ResourceID:   f.ID.String(),
	})

	return &submitOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}

// ─── List (admin) ────────────────────────────────────────────────────────────

type feedbackJSON struct {
	ID             uuid.UUID  `json:"id"`
	UserID         uuid.UUID  `json:"user_id"`
	SubmitterName  string     `json:"submitter_name"`
	SubmitterEmail string     `json:"submitter_email"`
	Category       string     `json:"category"`
	Message        string     `json:"message"`
	Status         string     `json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
	AcknowledgedAt *time.Time `json:"acknowledged_at,omitempty"`
}

type listInput struct {
	IncludeAcknowledged bool `query:"include_acknowledged"`
}

type listOutput struct {
	Body []feedbackJSON
}

func (s *Service) handleList(ctx context.Context, in *listInput) (*listOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadAdmin); err != nil {
		return nil, err
	}
	if !p.IsPrivileged() {
		return nil, platform.Forbidden("only admins or PIs may view feedback")
	}

	rows, err := s.List(ctx, in.IncludeAcknowledged)
	if err != nil {
		return nil, err
	}
	out := make([]feedbackJSON, len(rows))
	for i, r := range rows {
		out[i] = feedbackJSON{
			ID:             r.ID,
			UserID:         r.UserID,
			SubmitterName:  r.SubmitterName,
			SubmitterEmail: r.SubmitterEmail,
			Category:       r.Category,
			Message:        r.Message,
			Status:         r.Status,
			CreatedAt:      r.CreatedAt,
			AcknowledgedAt: r.AcknowledgedAt,
		}
	}
	if out == nil {
		out = []feedbackJSON{}
	}
	return &listOutput{Body: out}, nil
}

// ─── Acknowledge (admin) ─────────────────────────────────────────────────────

type acknowledgeInput struct {
	ID uuid.UUID `path:"id"`
}

type acknowledgeOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleAcknowledge(ctx context.Context, in *acknowledgeInput) (*acknowledgeOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteAdmin); err != nil {
		return nil, err
	}
	if !p.IsPrivileged() {
		return nil, platform.Forbidden("only admins or PIs may acknowledge feedback")
	}

	if err := s.Acknowledge(ctx, p.UserID, in.ID); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "feedback.acknowledge",
		ResourceType: "feedback",
		ResourceID:   in.ID.String(),
	})

	return &acknowledgeOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}
