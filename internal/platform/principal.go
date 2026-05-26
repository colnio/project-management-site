package platform

import (
	"context"

	"github.com/google/uuid"
)

// Principal is the authenticated caller resolved by the auth middleware and
// read by every handler. It is the single source of "who is acting" and how.
// The same struct represents a human (JWT), an external agent (PAT), and the
// in-app AI (internal token) — only the Via* fields differ. This keeps one
// HTTP code path for all three, per spec §6.3 / §7.6.
type Principal struct {
	UserID        uuid.UUID
	Email         string
	IsSystemAdmin bool // system-level admin/PI override (every use is audited)

	// Exactly one of the Via* fields is set for non-interactive callers; both
	// nil means a first-party browser session (JWT).
	ViaTokenID          *uuid.UUID // PAT id, when called with Authorization: Bearer pat_...
	ViaAIConversationID *uuid.UUID // AI conversation/run id, when called with iai_... token

	// Scopes is the effective capability set already intersected with the
	// owner's resolved permissions (empty slice => full first-party session).
	Scopes []string
}

// HasScope reports whether the principal carries the given scope. A first-party
// browser session (no token) is unrestricted and always returns true.
func (p *Principal) HasScope(scope string) bool {
	if p == nil {
		return false
	}
	if p.ViaTokenID == nil && p.ViaAIConversationID == nil {
		return true // interactive human session is not scope-limited
	}
	for _, s := range p.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}

type principalCtxKey struct{}

// WithPrincipal stores the resolved principal on the context.
func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalCtxKey{}, p)
}

// PrincipalFrom returns the principal previously stored on the context.
func PrincipalFrom(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(principalCtxKey{}).(*Principal)
	return p, ok && p != nil
}
