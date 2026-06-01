package auth_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/testsupport"

	"log/slog"
	"os"
)

var testTables = []string{
	"internal_ai_tokens",
	"personal_access_tokens",
	"refresh_sessions",
	"local_credentials",
	"users",
}

func newTestService(t *testing.T) (*auth.Service, context.Context) {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, testTables...)

	cfg := &config.Config{
		JWTSigningKey:       "test-signing-key-32-bytes-padding",
		AccessTokenTTL:      15 * time.Minute,
		RefreshTokenTTL:     24 * time.Hour,
		CookieDomain:        "localhost",
		CookieSecure:        false,
		AllowedEmailDomains: []string{"graphene-lab.org"},
		WebOrigin:           "http://localhost:5173",
	}

	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))
	ctx := context.Background()

	svc, err := auth.NewService(ctx, pool, cfg, audit.Nop{}, log)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return svc, ctx
}

// ─── Password ────────────────────────────────────────────────────────────────

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := auth.HashPassword("correct-horse-battery-staple")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("expected PHC string, got %q", hash)
	}

	ok, err := auth.VerifyPassword(hash, "correct-horse-battery-staple")
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if !ok {
		t.Fatal("expected VerifyPassword to return true")
	}
}

func TestPasswordWrongPassword(t *testing.T) {
	hash, _ := auth.HashPassword("correct")
	ok, err := auth.VerifyPassword(hash, "wrong")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected false for wrong password")
	}
}

func TestPasswordTamperedHash(t *testing.T) {
	_, err := auth.VerifyPassword("not-a-valid-hash", "anything")
	if err == nil {
		t.Fatal("expected error for tampered/invalid hash")
	}
}

func TestPasswordEmptyPassword(t *testing.T) {
	hash, err := auth.HashPassword("")
	if err != nil {
		t.Fatalf("HashPassword empty: %v", err)
	}
	ok, _ := auth.VerifyPassword(hash, "")
	if !ok {
		t.Fatal("empty password should verify against its own hash")
	}
	ok2, _ := auth.VerifyPassword(hash, "non-empty")
	if ok2 {
		t.Fatal("non-empty should not match empty hash")
	}
}

// ─── User CRUD ───────────────────────────────────────────────────────────────

func TestCreateAndGetUser(t *testing.T) {
	svc, ctx := newTestService(t)

	u, err := svc.CreateUser(ctx, "Alice@Graphene-Lab.Org", "Alice")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if u.Email != "alice@graphene-lab.org" {
		t.Errorf("expected lowercased email, got %q", u.Email)
	}
	if u.DisplayName != "Alice" {
		t.Errorf("expected display name Alice, got %q", u.DisplayName)
	}

	// GetUserByEmail
	u2, err := svc.GetUserByEmail(ctx, "alice@graphene-lab.org")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if u2.ID != u.ID {
		t.Errorf("IDs differ: %v vs %v", u2.ID, u.ID)
	}

	u3, err := svc.GetUserByID(ctx, u.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if u3.Email != u.Email {
		t.Errorf("email mismatch")
	}
}

func TestGetUsersByIDs(t *testing.T) {
	svc, ctx := newTestService(t)

	u1, err := svc.CreateUser(ctx, "batch1@graphene-lab.org", "Batch One")
	if err != nil {
		t.Fatalf("CreateUser u1: %v", err)
	}
	u2, err := svc.CreateUser(ctx, "batch2@graphene-lab.org", "Batch Two")
	if err != nil {
		t.Fatalf("CreateUser u2: %v", err)
	}

	byID, err := svc.GetUsersByIDs(ctx, []uuid.UUID{u1.ID, u2.ID, uuid.New()})
	if err != nil {
		t.Fatalf("GetUsersByIDs: %v", err)
	}
	if len(byID) != 2 {
		t.Fatalf("expected 2 users, got %d", len(byID))
	}
	if byID[u1.ID].Email != "batch1@graphene-lab.org" {
		t.Errorf("u1 email = %q", byID[u1.ID].Email)
	}

	empty, err := svc.GetUsersByIDs(ctx, nil)
	if err != nil {
		t.Fatalf("GetUsersByIDs empty: %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("expected empty map, got %d", len(empty))
	}
}

func TestCreateUserDuplicateConflict(t *testing.T) {
	svc, ctx := newTestService(t)

	_, err := svc.CreateUser(ctx, "dup@graphene-lab.org", "First")
	if err != nil {
		t.Fatalf("first CreateUser: %v", err)
	}
	_, err = svc.CreateUser(ctx, "dup@graphene-lab.org", "Second")
	if err == nil {
		t.Fatal("expected conflict error on duplicate email")
	}
	if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("expected 'already exists' in error, got: %v", err)
	}
}

func TestGetUserByEmailNotFound(t *testing.T) {
	svc, ctx := newTestService(t)

	_, err := svc.GetUserByEmail(ctx, "nobody@graphene-lab.org")
	if err == nil {
		t.Fatal("expected not-found error")
	}
}

func TestGetUserByIDNotFound(t *testing.T) {
	svc, ctx := newTestService(t)

	_, err := svc.GetUserByID(ctx, uuid.New())
	if err == nil {
		t.Fatal("expected not-found error")
	}
}

// ─── Access JWT ──────────────────────────────────────────────────────────────

func TestAccessTokenRoundTrip(t *testing.T) {
	svc, ctx := newTestService(t)

	u, err := svc.CreateUser(ctx, "jwt@graphene-lab.org", "JWT User")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	rawToken := auth.ExportIssueAccessToken(t, svc, u)

	p, err := svc.VerifyAccessToken(ctx, rawToken)
	if err != nil {
		t.Fatalf("VerifyAccessToken: %v", err)
	}
	if p.UserID != u.ID {
		t.Errorf("UserID mismatch: got %v, want %v", p.UserID, u.ID)
	}
	if p.Email != u.Email {
		t.Errorf("Email mismatch")
	}
	if p.ViaTokenID != nil || p.ViaAIConversationID != nil {
		t.Error("expected nil Via* fields for first-party session")
	}
}

func TestAccessTokenExpired(t *testing.T) {
	svc, ctx := newTestService(t)

	// Craft a config with negative TTL to immediately expire.
	pool := testsupport.NewPool(t)
	cfg := &config.Config{
		JWTSigningKey:   "test-key",
		AccessTokenTTL:  -1 * time.Second, // already expired
		RefreshTokenTTL: 24 * time.Hour,
	}
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	svc2, _ := auth.NewService(ctx, pool, cfg, audit.Nop{}, log)

	u, _ := svc.CreateUser(ctx, "exp@graphene-lab.org", "Expired")
	rawToken := auth.ExportIssueAccessToken(t, svc2, u)

	_, err := svc2.VerifyAccessToken(ctx, rawToken)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestAccessTokenInvalidSignature(t *testing.T) {
	svc, ctx := newTestService(t)
	u, _ := svc.CreateUser(ctx, "badsig@graphene-lab.org", "Bad Sig")
	rawToken := auth.ExportIssueAccessToken(t, svc, u)

	// Tamper the token.
	parts := strings.Split(rawToken, ".")
	if len(parts) == 3 {
		parts[2] = "invalidsignature"
		rawToken = strings.Join(parts, ".")
	}

	_, err := svc.VerifyAccessToken(ctx, rawToken)
	if err == nil {
		t.Fatal("expected error for invalid signature")
	}
}

// ─── PAT ─────────────────────────────────────────────────────────────────────

func TestPATFullLifecycle(t *testing.T) {
	svc, ctx := newTestService(t)
	u, _ := svc.CreateUser(ctx, "pat@graphene-lab.org", "PAT User")

	// Create PAT.
	id, raw, err := auth.ExportCreatePAT(t, svc, ctx, u.ID, "test-token", []string{platform.ScopeReadProjects, platform.ScopeWriteProjects}, nil)
	if err != nil {
		t.Fatalf("createPAT: %v", err)
	}
	if !strings.HasPrefix(raw, "pat_") {
		t.Errorf("expected pat_ prefix, got %q", raw[:8])
	}

	// Verify success.
	p, err := svc.VerifyPAT(ctx, raw)
	if err != nil {
		t.Fatalf("VerifyPAT: %v", err)
	}
	if p.UserID != u.ID {
		t.Errorf("UserID mismatch")
	}
	if p.ViaTokenID == nil || *p.ViaTokenID != id {
		t.Errorf("ViaTokenID not set correctly: got %v, want %v", p.ViaTokenID, id)
	}
	if len(p.Scopes) != 2 {
		t.Errorf("expected 2 scopes, got %d", len(p.Scopes))
	}

	// Revoke.
	if err := auth.ExportRevokePAT(t, svc, ctx, u.ID, id); err != nil {
		t.Fatalf("revokePAT: %v", err)
	}

	// Verify revoked token is rejected.
	_, err = svc.VerifyPAT(ctx, raw)
	if err == nil {
		t.Fatal("expected error for revoked token")
	}
}

func TestPATExpired(t *testing.T) {
	svc, ctx := newTestService(t)
	u, _ := svc.CreateUser(ctx, "patexp@graphene-lab.org", "PAT Exp")

	exp := time.Now().Add(-1 * time.Hour) // already expired
	_, raw, err := auth.ExportCreatePAT(t, svc, ctx, u.ID, "expired", []string{platform.ScopeReadProjects}, &exp)
	if err != nil {
		t.Fatalf("createPAT: %v", err)
	}

	_, err = svc.VerifyPAT(ctx, raw)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestPATUnknownPrefix(t *testing.T) {
	svc, ctx := newTestService(t)

	_, err := svc.VerifyPAT(ctx, "pat_unknownprefixXXXXXXXXXXXX")
	if err == nil {
		t.Fatal("expected error for unknown prefix")
	}
}

func TestPATScopesOnPrincipal(t *testing.T) {
	svc, ctx := newTestService(t)
	u, _ := svc.CreateUser(ctx, "patscopes@graphene-lab.org", "Scopes User")

	scopes := []string{platform.ScopeReadSamples, platform.ScopeWriteProjects}
	_, raw, _ := auth.ExportCreatePAT(t, svc, ctx, u.ID, "scoped", scopes, nil)

	p, err := svc.VerifyPAT(ctx, raw)
	if err != nil {
		t.Fatalf("VerifyPAT: %v", err)
	}
	if !p.HasScope(platform.ScopeReadSamples) {
		t.Error("expected HasScope('read:samples') = true")
	}
	if !p.HasScope(platform.ScopeWriteProjects) {
		t.Error("expected HasScope('write:projects') = true")
	}
	if p.HasScope(platform.ScopeReadAdmin) {
		t.Error("expected HasScope('read:admin') = false")
	}
}

// ─── Internal LLM Token ──────────────────────────────────────────────────────

func TestInternalAITokenLifecycle(t *testing.T) {
	svc, ctx := newTestService(t)
	u, _ := svc.CreateUser(ctx, "iai@graphene-lab.org", "LLM User")
	convID := uuid.New()

	raw, err := svc.MintInternalAIToken(ctx, u.ID, convID, []string{"read"}, json.RawMessage(`{"k":"v"}`))
	if err != nil {
		t.Fatalf("MintInternalAIToken: %v", err)
	}
	if !strings.HasPrefix(raw, "iai_") {
		t.Errorf("expected iai_ prefix")
	}

	// Verify.
	p, err := svc.VerifyInternalAIToken(ctx, raw)
	if err != nil {
		t.Fatalf("VerifyInternalAIToken: %v", err)
	}
	if p.UserID != u.ID {
		t.Errorf("UserID mismatch")
	}
	if p.ViaAIConversationID == nil || *p.ViaAIConversationID != convID {
		t.Errorf("ViaAIConversationID mismatch: got %v, want %v", p.ViaAIConversationID, convID)
	}

	// Revoke.
	if err := svc.RevokeInternalAITokens(ctx, convID); err != nil {
		t.Fatalf("RevokeInternalAITokens: %v", err)
	}

	// After revoke, token should be rejected.
	_, err = svc.VerifyInternalAIToken(ctx, raw)
	if err == nil {
		t.Fatal("expected error after revoke")
	}
}

func TestInternalAITokenUnknownPrefix(t *testing.T) {
	svc, ctx := newTestService(t)

	_, err := svc.VerifyInternalAIToken(ctx, "iai_unknownprefixXXXXXXXXXXXX")
	if err == nil {
		t.Fatal("expected error for unknown prefix")
	}
}

// ─── emailDomainAllowed ──────────────────────────────────────────────────────

func TestEmailDomainAllowed(t *testing.T) {
	tests := []struct {
		email   string
		allowed []string
		want    bool
	}{
		{"user@graphene-lab.org", []string{"graphene-lab.org"}, true},
		{"user@GRAPHENE-LAB.ORG", []string{"graphene-lab.org"}, true},
		{"user@other.org", []string{"graphene-lab.org"}, false},
		{"user@anything.com", []string{}, true},  // empty = allow all
		{"notanemail", []string{"graphene-lab.org"}, false},
		{"user@corp.com", []string{"graphene-lab.org", "corp.com"}, true},
	}
	for _, tc := range tests {
		got := auth.ExportEmailDomainAllowed(tc.email, tc.allowed)
		if got != tc.want {
			t.Errorf("emailDomainAllowed(%q, %v) = %v, want %v", tc.email, tc.allowed, got, tc.want)
		}
	}
}

func TestPasswordTooLongRejected(t *testing.T) {
	long := strings.Repeat("a", auth.MaxPasswordBytes+1)
	_, err := auth.HashPassword(long)
	if err == nil {
		t.Fatal("expected error for password over max length")
	}
	hash, err := auth.HashPassword("short")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	ok, err := auth.VerifyPassword(hash, long)
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if ok {
		t.Fatal("expected false for overlong password")
	}
}

func TestPATRejectsSuspendedUser(t *testing.T) {
	svc, ctx := newTestService(t)
	u, _ := svc.CreateUser(ctx, "suspat@graphene-lab.org", "Suspended PAT")
	if err := svc.SetUserStatus(ctx, u.ID, "suspended"); err != nil {
		t.Fatalf("SetUserStatus: %v", err)
	}
	_, raw, err := auth.ExportCreatePAT(t, svc, ctx, u.ID, "sus", []string{platform.ScopeReadProjects}, nil)
	if err != nil {
		t.Fatalf("createPAT: %v", err)
	}
	_, err = svc.VerifyPAT(ctx, raw)
	if err == nil {
		t.Fatal("expected VerifyPAT to reject suspended user")
	}
}

func TestCreatePATInvalidScope(t *testing.T) {
	svc, ctx := newTestService(t)
	u, _ := svc.CreateUser(ctx, "badscope@graphene-lab.org", "Bad Scope")
	_, _, err := auth.ExportCreatePAT(t, svc, ctx, u.ID, "bad", []string{"not-a-real-scope"}, nil)
	if err == nil {
		t.Fatal("expected error for invalid scope")
	}
}

func TestSeedDevUserRejectsProduction(t *testing.T) {
	pool := testsupport.NewPool(t)
	cfg := &config.Config{
		Env:             "production",
		JWTSigningKey:   strings.Repeat("k", 32),
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 24 * time.Hour,
	}
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	svc, err := auth.NewService(context.Background(), pool, cfg, audit.Nop{}, log)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	if err := svc.SeedDevUser(context.Background()); err == nil {
		t.Fatal("expected SeedDevUser to fail in production")
	}
}

// ─── SeedDevUser ─────────────────────────────────────────────────────────────

func TestSeedDevUser(t *testing.T) {
	svc, ctx := newTestService(t)

	// Should be idempotent — call twice.
	if err := svc.SeedDevUser(ctx); err != nil {
		t.Fatalf("SeedDevUser first call: %v", err)
	}
	if err := svc.SeedDevUser(ctx); err != nil {
		t.Fatalf("SeedDevUser second call: %v", err)
	}

	u, err := svc.GetUserByEmail(ctx, "dev@graphene-lab.org")
	if err != nil {
		t.Fatalf("GetUserByEmail after seed: %v", err)
	}
	if u.GlobalRole != "admin" {
		t.Errorf("expected dev user to have global_role 'admin', got %q", u.GlobalRole)
	}
	if u.DisplayName != "Dev User" {
		t.Errorf("expected 'Dev User', got %q", u.DisplayName)
	}
}

// ─── OIDC removed ────────────────────────────────────────────────────────────

func TestOIDCLoginUnavailable(t *testing.T) {
	svc, _ := newTestService(t)
	// OIDC has been removed; OIDCAvailable always returns false.
	if svc.OIDCAvailable() {
		t.Fatal("expected OIDCAvailable() == false after OIDC removal")
	}
}
