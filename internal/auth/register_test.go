package auth_test

// Tests for handleRegister, handleLogin approval gate, and UpdateProfile.
// Follows the conventions in auth_test.go: package auth_test, newTestService(),
// call handler/service methods directly with context carrying a Principal.

import (
	"context"
	"testing"

	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/testsupport"
	"github.com/colnio/project-management-site/internal/audit"

	"log/slog"
	"os"
	"time"
)

// newNUSTestService builds a Service with NUS domains in the allow-list.
func newNUSTestService(t *testing.T) (*auth.Service, context.Context) {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, testTables...)

	cfg := &config.Config{
		JWTSigningKey:       "test-signing-key-32-bytes-padding",
		AccessTokenTTL:      15 * time.Minute,
		RefreshTokenTTL:     24 * time.Hour,
		CookieDomain:        "localhost",
		CookieSecure:        false,
		AllowedEmailDomains: []string{"nus.edu.sg", "u.nus.edu"},
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

// ─── handleRegister ───────────────────────────────────────────────────────────

func TestRegister_ValidNUSDomainCreatesPendingUser(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	out, err := auth.ExportHandleRegister(t, svc, ctx, "x@u.nus.edu", "password123", "password123")
	if err != nil {
		t.Fatalf("handleRegister: %v", err)
	}
	if out.Body.Status != "pending" {
		t.Errorf("expected status=pending, got %q", out.Body.Status)
	}

	// Verify the user was created with status=pending and global_role=member.
	u, err := svc.GetUserByEmail(ctx, "x@u.nus.edu")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if u.Status != "pending" {
		t.Errorf("expected user status=pending, got %q", u.Status)
	}
	if u.GlobalRole != "member" {
		t.Errorf("expected global_role=member, got %q", u.GlobalRole)
	}
}

func TestRegister_ValidNUSEduSgDomain(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	_, err := auth.ExportHandleRegister(t, svc, ctx, "alice@nus.edu.sg", "password123", "password123")
	if err != nil {
		t.Fatalf("handleRegister with nus.edu.sg: %v", err)
	}

	u, err := svc.GetUserByEmail(ctx, "alice@nus.edu.sg")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if u.Status != "pending" {
		t.Errorf("expected pending, got %q", u.Status)
	}
}

func TestRegister_DomainNotAllowed(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	_, err := auth.ExportHandleRegister(t, svc, ctx, "user@gmail.com", "password123", "password123")
	if err == nil {
		t.Fatal("expected domain_not_allowed error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.Code != "auth.domain_not_allowed" {
		t.Errorf("expected code auth.domain_not_allowed, got %q", em.Code)
	}
	if em.GetStatus() != 400 {
		t.Errorf("expected HTTP 400, got %d", em.GetStatus())
	}
}

func TestRegister_PasswordMismatch(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	_, err := auth.ExportHandleRegister(t, svc, ctx, "y@u.nus.edu", "password123", "different456")
	if err == nil {
		t.Fatal("expected password_mismatch error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.Code != "auth.password_mismatch" {
		t.Errorf("expected code auth.password_mismatch, got %q", em.Code)
	}
}

func TestRegister_PasswordTooShort(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	_, err := auth.ExportHandleRegister(t, svc, ctx, "z@u.nus.edu", "short", "short")
	if err == nil {
		t.Fatal("expected password_too_short error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.Code != "auth.password_too_short" {
		t.Errorf("expected code auth.password_too_short, got %q", em.Code)
	}
}

func TestRegister_ExactlyEightCharPasswordAccepted(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	_, err := auth.ExportHandleRegister(t, svc, ctx, "eightchars@u.nus.edu", "12345678", "12345678")
	if err != nil {
		t.Fatalf("expected success for 8-char password: %v", err)
	}
}

func TestRegister_DuplicateEmailRejected(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	// First registration succeeds.
	_, err := auth.ExportHandleRegister(t, svc, ctx, "dup@u.nus.edu", "password123", "password123")
	if err != nil {
		t.Fatalf("first registration: %v", err)
	}

	// Second registration with same email is rejected.
	_, err = auth.ExportHandleRegister(t, svc, ctx, "dup@u.nus.edu", "password456", "password456")
	if err == nil {
		t.Fatal("expected email_taken error on duplicate registration")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.Code != "auth.email_taken" {
		t.Errorf("expected code auth.email_taken, got %q", em.Code)
	}
	if em.GetStatus() != 409 {
		t.Errorf("expected HTTP 409, got %d", em.GetStatus())
	}
}

func TestRegister_NoTokenInOutput(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	out, err := auth.ExportHandleRegister(t, svc, ctx, "notoken@u.nus.edu", "password123", "password123")
	if err != nil {
		t.Fatalf("handleRegister: %v", err)
	}
	// registerOutput has no Token field — just Status/Message.
	// Assert status is 201 and message is non-empty.
	if out.Status != 201 {
		t.Errorf("expected HTTP 201, got %d", out.Status)
	}
	if out.Body.Message == "" {
		t.Error("expected non-empty message in output")
	}
}

// ─── Login approval gate ──────────────────────────────────────────────────────

func TestLogin_PendingUserRejected(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	// Register creates a pending user.
	_, err := auth.ExportHandleRegister(t, svc, ctx, "pending@u.nus.edu", "password123", "password123")
	if err != nil {
		t.Fatalf("register: %v", err)
	}

	_, err = auth.ExportHandleLogin(t, svc, ctx, "pending@u.nus.edu", "password123")
	if err == nil {
		t.Fatal("expected auth.pending_approval error for pending user login")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.Code != "auth.pending_approval" {
		t.Errorf("expected code auth.pending_approval, got %q", em.Code)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected HTTP 403, got %d", em.GetStatus())
	}
}

func TestLogin_SuspendedUserRejected(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	// Create user and set them approved, then suspended.
	u, err := svc.CreateUser(ctx, "suspended@nus.edu.sg", "Suspended User")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := svc.SetPassword(ctx, u.ID, "password123"); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}
	if err := svc.SetUserStatus(ctx, u.ID, "suspended"); err != nil {
		t.Fatalf("SetUserStatus suspended: %v", err)
	}

	_, err = auth.ExportHandleLogin(t, svc, ctx, "suspended@nus.edu.sg", "password123")
	if err == nil {
		t.Fatal("expected auth.suspended error for suspended user login")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.Code != "auth.suspended" {
		t.Errorf("expected code auth.suspended, got %q", em.Code)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected HTTP 403, got %d", em.GetStatus())
	}
}

func TestLogin_ApprovedUserSucceeds(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	// Create and approve a user.
	u, err := svc.CreateUser(ctx, "approved@nus.edu.sg", "Approved User")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := svc.SetPassword(ctx, u.ID, "password123"); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}
	if err := svc.SetUserStatus(ctx, u.ID, "approved"); err != nil {
		t.Fatalf("SetUserStatus approved: %v", err)
	}

	out, err := auth.ExportHandleLogin(t, svc, ctx, "approved@nus.edu.sg", "password123")
	if err != nil {
		t.Fatalf("login should succeed for approved user: %v", err)
	}
	if out.Body.AccessToken == "" {
		t.Error("expected non-empty access_token in login output")
	}
	if out.Body.User.Email != "approved@nus.edu.sg" {
		t.Errorf("expected email approved@nus.edu.sg, got %q", out.Body.User.Email)
	}
}

// ─── UpdateProfile ────────────────────────────────────────────────────────────

func TestUpdateProfile_SetsFieldsAndCompletesProfile(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	u, err := svc.CreateUser(ctx, "profile@nus.edu.sg", "")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	updated, err := svc.UpdateProfile(ctx, u.ID, "Alice", "Tan", "PhD Student", "Researching NMC batteries", "")
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if updated.FirstName != "Alice" {
		t.Errorf("expected first_name=Alice, got %q", updated.FirstName)
	}
	if updated.LastName != "Tan" {
		t.Errorf("expected last_name=Tan, got %q", updated.LastName)
	}
	if updated.Title != "PhD Student" {
		t.Errorf("expected title=PhD Student, got %q", updated.Title)
	}
	if updated.Description != "Researching NMC batteries" {
		t.Errorf("expected description set, got %q", updated.Description)
	}
	if !updated.ProfileCompleted {
		t.Error("expected profile_completed=true after UpdateProfile")
	}
}

func TestUpdateProfile_DerivesDisplayNameFromFirstLast(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	u, err := svc.CreateUser(ctx, "displayname@nus.edu.sg", "")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	// No explicit display_name — should be derived from first+last.
	updated, err := svc.UpdateProfile(ctx, u.ID, "Bob", "Lee", "Researcher", "", "")
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if updated.DisplayName != "Bob Lee" {
		t.Errorf("expected display_name=Bob Lee, got %q", updated.DisplayName)
	}
}

func TestUpdateProfile_ExplicitDisplayNameOverridesDerivation(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	u, err := svc.CreateUser(ctx, "explicit@nus.edu.sg", "Old Name")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	updated, err := svc.UpdateProfile(ctx, u.ID, "Carol", "Chen", "PI", "", "Prof. Carol")
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if updated.DisplayName != "Prof. Carol" {
		t.Errorf("expected display_name=Prof. Carol, got %q", updated.DisplayName)
	}
}

func TestUpdateProfile_HandlerUsesContextPrincipal(t *testing.T) {
	svc, ctx := newNUSTestService(t)

	u, err := svc.CreateUser(ctx, "handler@nus.edu.sg", "")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	// Inject a Principal in context as the handler would receive.
	p := &platform.Principal{UserID: u.ID, Email: u.Email, GlobalRole: "member"}
	ctxWithP := platform.WithPrincipal(ctx, p)

	out, err := auth.ExportHandleUpdateProfile(t, svc, ctxWithP, "Dan", "Wu", "Research Assistant", "Work on cycling", "")
	if err != nil {
		t.Fatalf("handleUpdateProfile: %v", err)
	}
	if !out.Body.ProfileCompleted {
		t.Error("expected profile_completed=true in handler output")
	}
	if out.Body.DisplayName != "Dan Wu" {
		t.Errorf("expected display_name=Dan Wu, got %q", out.Body.DisplayName)
	}
}
