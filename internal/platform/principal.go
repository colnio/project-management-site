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
//
// GlobalRole carries the user's platform-level role ("admin", "pi", or
// "member"). Use IsAdmin(), IsPI(), and IsPrivileged() rather than comparing
// the string directly — those methods are nil-safe.
type Principal struct {
	UserID     uuid.UUID
	Email      string
	GlobalRole string // "admin" | "pi" | "member" | "" (legacy/unknown)

	// Exactly one of the Via* fields is set for non-interactive callers; both
	// nil means a first-party browser session (JWT).
	ViaTokenID          *uuid.UUID // PAT id, when called with Authorization: Bearer pat_...
	ViaAIConversationID *uuid.UUID // AI conversation/run id, when called with iai_... token

	// Scopes is the effective capability set already intersected with the
	// owner's resolved permissions (empty slice => full first-party session).
	Scopes []string
}

// IsAdmin reports whether the principal holds the "admin" global role.
func (p *Principal) IsAdmin() bool { return p != nil && p.GlobalRole == "admin" }

// IsPI reports whether the principal holds the "pi" global role.
func (p *Principal) IsPI() bool { return p != nil && p.GlobalRole == "pi" }

// IsPrivileged reports whether the principal is admin or PI — i.e. holds
// elevated platform-level access beyond a regular member.
func (p *Principal) IsPrivileged() bool { return p.IsAdmin() || p.IsPI() }

// HasScope reports whether the principal carries the given scope.
//
// Rules:
//   - A first-party browser session (both Via* fields nil) is unrestricted and
//     always returns true.
//   - A token caller (ViaTokenID != nil or ViaAIConversationID != nil) whose
//     Scopes slice is nil or empty is treated as a legacy unrestricted token and
//     always returns true. This preserves backward-compatibility for PATs that
//     were created before scoped enforcement was introduced.
//   - A token caller with a NON-EMPTY Scopes list is enforced normally: only
//     scopes present in the list are granted. A PAT scoped to ["read:audit"]
//     will be denied all other endpoints.
func (p *Principal) HasScope(scope string) bool {
	if p == nil {
		return false
	}
	if p.ViaTokenID == nil && p.ViaAIConversationID == nil {
		return true // interactive human session is not scope-limited
	}
	// Token caller: empty Scopes means legacy unrestricted token.
	if len(p.Scopes) == 0 {
		return true
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
