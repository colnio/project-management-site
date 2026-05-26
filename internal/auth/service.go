// Package auth implements the Identity/Auth module (A1): user management,
// local-password login, OIDC SSO, JWT access tokens, refresh sessions,
// personal access tokens (PATs), and internal AI tokens.
package auth

import (
	"context"
	"log/slog"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/config"
)

// oidcProvider wraps the go-oidc Provider + a verifier. It is nil when the
// OIDC issuer is unreachable (local-only env).
type oidcProvider struct {
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
}

// Service is the auth module's domain service. Construct with NewService.
type Service struct {
	pool *pgxpool.Pool
	cfg  *config.Config
	rec  audit.Recorder
	oidc *oidcProvider // nil when issuer unreachable
	log  *slog.Logger
}

// NewService constructs a Service. It attempts to discover the OIDC provider
// at cfg.OIDCIssuer; if that fails (e.g. the mock server is not running) it
// logs a warning and continues — local-password + token paths still work.
func NewService(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config, rec audit.Recorder, log *slog.Logger) (*Service, error) {
	svc := &Service{
		pool: pool,
		cfg:  cfg,
		rec:  rec,
		log:  log,
	}

	provider, err := oidc.NewProvider(ctx, cfg.OIDCIssuer)
	if err != nil {
		log.Warn("auth: OIDC provider unavailable; OIDC login disabled",
			"issuer", cfg.OIDCIssuer,
			"error", err,
		)
	} else {
		svc.oidc = &oidcProvider{
			provider: provider,
			verifier: provider.Verifier(&oidc.Config{ClientID: cfg.OIDCClientID}),
		}
	}

	return svc, nil
}
