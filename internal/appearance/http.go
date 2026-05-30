package appearance

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires the appearance HTTP endpoints.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "appearance-get",
		Method:      http.MethodGet,
		Path:        "/v1/me/appearance",
		Summary:     "Get appearance preferences",
		Tags:        []string{"appearance"},
	}, svc.handleGet)

	huma.Register(api, huma.Operation{
		OperationID: "appearance-patch",
		Method:      http.MethodPatch,
		Path:        "/v1/me/appearance",
		Summary:     "Update appearance preferences",
		Tags:        []string{"appearance"},
	}, svc.handlePatch)
}

type getOutput struct {
	Body struct {
		Prefs json.RawMessage `json:"prefs"`
	}
}

func (s *Service) handleGet(ctx context.Context, _ *struct{}) (*getOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	raw, err := s.Get(ctx, p.UserID)
	if err != nil {
		return nil, err
	}
	out := &getOutput{}
	out.Body.Prefs = raw
	return out, nil
}

type patchInput struct {
	Body struct {
		Prefs json.RawMessage `json:"prefs"`
	}
}

type patchOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handlePatch(ctx context.Context, in *patchInput) (*patchOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	// Validate that prefs is a JSON object (not an array, string, or null).
	if len(in.Body.Prefs) == 0 {
		return nil, platform.BadRequest("appearance.prefs_required", "prefs is required")
	}
	// Quick structural check: must start with '{'.
	trimmed := in.Body.Prefs
	for len(trimmed) > 0 && (trimmed[0] == ' ' || trimmed[0] == '\t' || trimmed[0] == '\n' || trimmed[0] == '\r') {
		trimmed = trimmed[1:]
	}
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return nil, platform.BadRequest("appearance.prefs_invalid", "prefs must be a JSON object")
	}

	if err := s.Put(ctx, p.UserID, in.Body.Prefs); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "appearance.update",
		ResourceType: "user",
		ResourceID:   p.UserID.String(),
	})

	return &patchOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}
