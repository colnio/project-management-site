package platform

import (
	"context"
	"log/slog"
)

// TokenVerifier resolves a bearer credential into a Principal. The auth module's
// *Service satisfies this; platform depends on the interface (not auth) to avoid
// an import cycle. Each method gets the raw credential string and returns the
// resolved principal or an error.
type TokenVerifier interface {
	VerifyAccessToken(ctx context.Context, raw string) (*Principal, error)
	VerifyPAT(ctx context.Context, raw string) (*Principal, error)
	VerifyInternalAIToken(ctx context.Context, raw string) (*Principal, error)
}

// IdempotencyStore persists write responses keyed by (principal, Idempotency-Key)
// so a retried request replays the original response instead of re-executing.
type IdempotencyStore interface {
	Lookup(ctx context.Context, principalKey, key string) (status int, body []byte, found bool, err error)
	Save(ctx context.Context, principalKey, key string, status int, body []byte) error
}

// ServerDeps are passed to New so the full middleware chain is installed before
// huma mounts routes. All fields except Logger may be nil (degraded mode).
type ServerDeps struct {
	Logger      *slog.Logger
	WebOrigin   string
	Verifier    TokenVerifier
	Idempotency IdempotencyStore

	// PerMinute is the default per-token rate limit. Zero disables limiting.
	PerMinute int
}
