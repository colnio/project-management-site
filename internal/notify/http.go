package notify

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires notify HTTP endpoints.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "notify-preferences-get",
		Method:      http.MethodGet,
		Path:        "/v1/me/notification-preferences",
		Summary:     "List notification preferences",
		Tags:        []string{"notify"},
	}, svc.handleGetPreferences)

	huma.Register(api, huma.Operation{
		OperationID: "notify-preferences-patch",
		Method:      http.MethodPatch,
		Path:        "/v1/me/notification-preferences",
		Summary:     "Update notification preferences",
		Tags:        []string{"notify"},
	}, svc.handlePatchPreferences)

	huma.Register(api, huma.Operation{
		OperationID: "admin-broadcast-create",
		Method:      http.MethodPost,
		Path:        "/v1/admin/broadcasts",
		Summary:     "Send admin email broadcast",
		Description: "Sends a mandatory email to the selected audience. Requires admin or PI role.",
		Tags:        []string{"admin", "notify"},
	}, svc.handleCreateBroadcast)
}

// RegisterPublic mounts routes without huma (digest unsubscribe link from email).
func RegisterPublic(router interface {
	Get(pattern string, handlerFn http.HandlerFunc)
}, svc *Service) {
	router.Get("/v1/notify/digest/unsubscribe", svc.handleDigestUnsubscribe)
}

type getPreferencesOutput struct {
	Body []PreferenceItem
}

func (s *Service) handleGetPreferences(ctx context.Context, _ *struct{}) (*getPreferencesOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadNotify); err != nil {
		return nil, err
	}
	items, err := s.ListPreferences(ctx, p.UserID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []PreferenceItem{}
	}
	return &getPreferencesOutput{Body: items}, nil
}

type patchPreferencesInput struct {
	Body struct {
		Preferences map[string]bool `json:"preferences"`
	}
}

type patchPreferencesOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handlePatchPreferences(ctx context.Context, in *patchPreferencesInput) (*patchPreferencesOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteNotify); err != nil {
		return nil, err
	}
	if in.Body.Preferences == nil {
		return nil, platform.BadRequest("notify.prefs_required", "preferences map is required")
	}
	for cat, enabled := range in.Body.Preferences {
		if isMandatory(cat) && !enabled {
			return nil, platform.BadRequest("notify.mandatory_category", "cannot disable mandatory category: "+cat)
		}
	}
	if err := s.UpdatePreferences(ctx, p.UserID, in.Body.Preferences); err != nil {
		return nil, err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "notify.preferences_update",
		ResourceType: "user",
		ResourceID:   p.UserID.String(),
	})
	return &patchPreferencesOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}

type createBroadcastInput struct {
	Body struct {
		Subject     string     `json:"subject"`
		Body        string     `json:"body"`
		Audience    string     `json:"audience"`
		WorkspaceID *uuid.UUID `json:"workspace_id,omitempty"`
		UserIDs     []uuid.UUID `json:"user_ids,omitempty"`
	}
}

type createBroadcastOutput struct {
	Body struct {
		ID             uuid.UUID `json:"id"`
		RecipientsQueued int       `json:"recipients_queued"`
	}
}

func (s *Service) handleCreateBroadcast(ctx context.Context, in *createBroadcastInput) (*createBroadcastOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteAdmin); err != nil {
		return nil, err
	}
	if !p.IsPrivileged() {
		return nil, platform.Forbidden("only admins or PIs may send broadcasts")
	}

	id, count, err := s.CreateBroadcast(ctx, p.UserID, BroadcastInput{
		Subject:     in.Body.Subject,
		Body:        in.Body.Body,
		Audience:    in.Body.Audience,
		WorkspaceID: in.Body.WorkspaceID,
		UserIDs:     in.Body.UserIDs,
	})
	if err != nil {
		return nil, err
	}
	out := createBroadcastOutput{}
	out.Body.ID = id
	out.Body.RecipientsQueued = count
	return &out, nil
}

func (s *Service) handleDigestUnsubscribe(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusBadRequest)
		return
	}
	if err := s.UnsubscribeDigest(r.Context(), token); err != nil {
		http.Error(w, "invalid or expired link", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte("<!DOCTYPE html><html><body><p>Daily digest emails have been turned off. You can re-enable them in Settings → Notifications.</p></body></html>"))
}
