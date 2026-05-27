package auth

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Compile-time check to keep uuid import used.
var _ = uuid.Nil

// ExportHandleRegister exposes handleRegister for external tests.
func ExportHandleRegister(t *testing.T, svc *Service, ctx context.Context, email, password, passwordConfirm string) (*registerOutput, error) {
	t.Helper()
	in := &registerInput{}
	in.Body.Email = email
	in.Body.Password = password
	in.Body.PasswordConfirm = passwordConfirm
	return svc.handleRegister(ctx, in)
}

// ExportHandleLogin exposes handleLogin for external tests.
func ExportHandleLogin(t *testing.T, svc *Service, ctx context.Context, email, password string) (*loginOutput, error) {
	t.Helper()
	in := &loginInput{}
	in.Body.Email = email
	in.Body.Password = password
	return svc.handleLogin(ctx, in)
}

// ExportHandleUpdateProfile exposes handleUpdateProfile for external tests.
func ExportHandleUpdateProfile(t *testing.T, svc *Service, ctx context.Context, firstName, lastName, title, description, displayName string) (*updateProfileOutput, error) {
	t.Helper()
	in := &updateProfileInput{}
	in.Body.FirstName = firstName
	in.Body.LastName = lastName
	in.Body.Title = title
	in.Body.Description = description
	in.Body.DisplayName = displayName
	return svc.handleUpdateProfile(ctx, in)
}

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

// OIDCAvailable always returns false now that OIDC has been removed.
func (s *Service) OIDCAvailable() bool {
	return false
}

// ExportExtractCookieValue exposes extractCookieValue for tests.
func ExportExtractCookieValue(cookieHeader, name string) string {
	return extractCookieValue(cookieHeader, name)
}
