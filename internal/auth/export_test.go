package auth

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Compile-time check to keep uuid import used.
var _ = uuid.Nil

// ExportIssueAccessToken exposes issueAccessToken for tests.
func ExportIssueAccessToken(t *testing.T, svc *Service, u *User) string {
	t.Helper()
	tok, err := svc.issueAccessToken(u)
	if err != nil {
		t.Fatalf("issueAccessToken: %v", err)
	}
	return tok
}

// ExportCreatePAT exposes createPAT for tests.
func ExportCreatePAT(t *testing.T, svc *Service, ctx context.Context, userID uuid.UUID, name string, scopes []string, expiresAt *time.Time) (uuid.UUID, string, error) {
	t.Helper()
	return svc.createPAT(ctx, userID, name, scopes, expiresAt)
}

// ExportRevokePAT exposes revokePAT for tests.
func ExportRevokePAT(t *testing.T, svc *Service, ctx context.Context, ownerID, tokenID uuid.UUID) error {
	t.Helper()
	return svc.revokePAT(ctx, ownerID, tokenID)
}

// ExportEmailDomainAllowed exposes emailDomainAllowed for tests.
func ExportEmailDomainAllowed(email string, allowed []string) bool {
	return emailDomainAllowed(email, allowed)
}

// OIDCAvailable reports whether the OIDC provider was successfully configured.
func (s *Service) OIDCAvailable() bool {
	return s.oidc != nil
}

// ExportExtractCookieValue exposes extractCookieValue for tests.
func ExportExtractCookieValue(cookieHeader, name string) string {
	return extractCookieValue(cookieHeader, name)
}
