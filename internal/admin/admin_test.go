package admin_test

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/admin"
	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/testsupport"
)

var adminTestTables = []string{
	"internal_ai_tokens",
	"personal_access_tokens",
	"refresh_sessions",
	"local_credentials",
	"users",
}

func newAdminTestSvc(t *testing.T) (*admin.Service, *auth.Service, context.Context) {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, adminTestTables...)

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

	authSvc, err := auth.NewService(ctx, pool, cfg, audit.Nop{}, log)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	adminSvc := admin.NewService(authSvc, audit.Nop{})
	return adminSvc, authSvc, ctx
}

// privilegedCtx returns a context carrying an admin Principal.
func privilegedCtx(ctx context.Context, userID uuid.UUID, email string) context.Context {
	p := &platform.Principal{
		UserID:     userID,
		Email:      email,
		GlobalRole: "admin",
	}
	return platform.WithPrincipal(ctx, p)
}

// memberCtx returns a context carrying a member (non-privileged) Principal.
func memberCtx(ctx context.Context, userID uuid.UUID, email string) context.Context {
	p := &platform.Principal{
		UserID:     userID,
		Email:      email,
		GlobalRole: "member",
	}
	return platform.WithPrincipal(ctx, p)
}

// ─── Access gate: non-privileged member ──────────────────────────────────────

func TestAdminListUsers_MemberForbidden(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	member, err := authSvc.CreateUser(ctx, "member@graphene-lab.org", "Member")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	mCtx := memberCtx(ctx, member.ID, member.Email)
	_, err = admin.ExportHandleListUsers(t, adminSvc, mCtx)
	if err == nil {
		t.Fatal("expected forbidden error for member listing users")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected HTTP 403, got %d", em.GetStatus())
	}
}

func TestAdminUpdateUser_MemberForbidden(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	member, err := authSvc.CreateUser(ctx, "member2@graphene-lab.org", "Member 2")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	target, err := authSvc.CreateUser(ctx, "target@graphene-lab.org", "Target")
	if err != nil {
		t.Fatalf("CreateUser target: %v", err)
	}

	mCtx := memberCtx(ctx, member.ID, member.Email)
	status := "approved"
	_, err = admin.ExportHandleUpdateUser(t, adminSvc, mCtx, target.ID, &status, nil)
	if err == nil {
		t.Fatal("expected forbidden error for member updating user")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected HTTP 403, got %d", em.GetStatus())
	}
}

func TestAdminDeleteUser_MemberForbidden(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	member, err := authSvc.CreateUser(ctx, "member3@graphene-lab.org", "Member 3")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	target, err := authSvc.CreateUser(ctx, "target2@graphene-lab.org", "Target 2")
	if err != nil {
		t.Fatalf("CreateUser target: %v", err)
	}

	mCtx := memberCtx(ctx, member.ID, member.Email)
	_, err = admin.ExportHandleDeleteUser(t, adminSvc, mCtx, target.ID)
	if err == nil {
		t.Fatal("expected forbidden error for member deleting user")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected HTTP 403, got %d", em.GetStatus())
	}
}

// ─── Privileged admin operations ─────────────────────────────────────────────

func TestAdminListUsers_AdminCanList(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	adminUser, err := authSvc.CreateUser(ctx, "admin@graphene-lab.org", "Admin")
	if err != nil {
		t.Fatalf("CreateUser admin: %v", err)
	}
	_, err = authSvc.CreateUser(ctx, "user1@graphene-lab.org", "User One")
	if err != nil {
		t.Fatalf("CreateUser user1: %v", err)
	}

	aCtx := privilegedCtx(ctx, adminUser.ID, adminUser.Email)
	out, err := admin.ExportHandleListUsers(t, adminSvc, aCtx)
	if err != nil {
		t.Fatalf("handleListUsers: %v", err)
	}
	if len(out.Body) < 2 {
		t.Errorf("expected at least 2 users, got %d", len(out.Body))
	}
}

func TestAdminUpdateUser_ApprovePendingUser(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	adminUser, err := authSvc.CreateUser(ctx, "adminapprove@graphene-lab.org", "Admin")
	if err != nil {
		t.Fatalf("CreateUser admin: %v", err)
	}
	pending, err := authSvc.CreateUser(ctx, "newbie@graphene-lab.org", "Newbie")
	if err != nil {
		t.Fatalf("CreateUser pending: %v", err)
	}
	// Verify starts as pending.
	if pending.Status != "pending" {
		t.Errorf("expected new user to start as pending, got %q", pending.Status)
	}

	aCtx := privilegedCtx(ctx, adminUser.ID, adminUser.Email)
	status := "approved"
	_, err = admin.ExportHandleUpdateUser(t, adminSvc, aCtx, pending.ID, &status, nil)
	if err != nil {
		t.Fatalf("handleUpdateUser approve: %v", err)
	}

	// Verify status changed.
	updated, err := authSvc.GetUserByID(ctx, pending.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if updated.Status != "approved" {
		t.Errorf("expected status=approved after PATCH, got %q", updated.Status)
	}
}

func TestAdminUpdateUser_SetGlobalRoleToPI(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	adminUser, err := authSvc.CreateUser(ctx, "adminrole@graphene-lab.org", "Admin")
	if err != nil {
		t.Fatalf("CreateUser admin: %v", err)
	}
	target, err := authSvc.CreateUser(ctx, "roleme@graphene-lab.org", "Role Me")
	if err != nil {
		t.Fatalf("CreateUser target: %v", err)
	}

	aCtx := privilegedCtx(ctx, adminUser.ID, adminUser.Email)
	role := "pi"
	_, err = admin.ExportHandleUpdateUser(t, adminSvc, aCtx, target.ID, nil, &role)
	if err != nil {
		t.Fatalf("handleUpdateUser set pi: %v", err)
	}

	updated, err := authSvc.GetUserByID(ctx, target.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if updated.GlobalRole != "pi" {
		t.Errorf("expected global_role=pi, got %q", updated.GlobalRole)
	}
}

// ─── Self-lockout guard ───────────────────────────────────────────────────────

func TestAdminUpdateUser_SelfSuspendRejected(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	adminUser, err := authSvc.CreateUser(ctx, "selflock@graphene-lab.org", "Self Lock")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	aCtx := privilegedCtx(ctx, adminUser.ID, adminUser.Email)
	status := "suspended"
	_, err = admin.ExportHandleUpdateUser(t, adminSvc, aCtx, adminUser.ID, &status, nil)
	if err == nil {
		t.Fatal("expected self-lockout error when admin suspends themselves")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.Code != "admin.self_lockout" {
		t.Errorf("expected code admin.self_lockout, got %q", em.Code)
	}
	if em.GetStatus() != 400 {
		t.Errorf("expected HTTP 400, got %d", em.GetStatus())
	}
}

func TestAdminUpdateUser_SelfDemoteToMemberRejected(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	adminUser, err := authSvc.CreateUser(ctx, "selfdemote@graphene-lab.org", "Self Demote")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	aCtx := privilegedCtx(ctx, adminUser.ID, adminUser.Email)
	role := "member"
	_, err = admin.ExportHandleUpdateUser(t, adminSvc, aCtx, adminUser.ID, nil, &role)
	if err == nil {
		t.Fatal("expected self-lockout error when admin demotes themselves to member")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.Code != "admin.self_lockout" {
		t.Errorf("expected code admin.self_lockout, got %q", em.Code)
	}
}

// ─── Delete: reject pending ───────────────────────────────────────────────────

func TestAdminDeleteUser_RejectsPendingUser(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	adminUser, err := authSvc.CreateUser(ctx, "admindelete@graphene-lab.org", "Admin Delete")
	if err != nil {
		t.Fatalf("CreateUser admin: %v", err)
	}
	pending, err := authSvc.CreateUser(ctx, "pendingdelete@graphene-lab.org", "Pending Delete")
	if err != nil {
		t.Fatalf("CreateUser pending: %v", err)
	}

	aCtx := privilegedCtx(ctx, adminUser.ID, adminUser.Email)
	out, err := admin.ExportHandleDeleteUser(t, adminSvc, aCtx, pending.ID)
	if err != nil {
		t.Fatalf("handleDeleteUser: %v", err)
	}
	if !out.Body.OK {
		t.Error("expected ok=true for delete pending user")
	}

	// User should be gone.
	_, err = authSvc.GetUserByID(ctx, pending.ID)
	if err == nil {
		t.Error("expected not-found after deletion")
	}
}

func TestAdminDeleteUser_RefusesApprovedUser(t *testing.T) {
	adminSvc, authSvc, ctx := newAdminTestSvc(t)

	adminUser, err := authSvc.CreateUser(ctx, "adminrefuse@graphene-lab.org", "Admin Refuse")
	if err != nil {
		t.Fatalf("CreateUser admin: %v", err)
	}
	approvedUser, err := authSvc.CreateUser(ctx, "approved@graphene-lab.org", "Approved")
	if err != nil {
		t.Fatalf("CreateUser approved: %v", err)
	}
	if err := authSvc.SetUserStatus(ctx, approvedUser.ID, "approved"); err != nil {
		t.Fatalf("SetUserStatus: %v", err)
	}

	aCtx := privilegedCtx(ctx, adminUser.ID, adminUser.Email)
	_, err = admin.ExportHandleDeleteUser(t, adminSvc, aCtx, approvedUser.ID)
	if err == nil {
		t.Fatal("expected error when trying to delete an approved user")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.Code != "admin.not_pending" {
		t.Errorf("expected code admin.not_pending, got %q", em.Code)
	}
}

// ─── ListUsers service method ─────────────────────────────────────────────────

func TestAuthServiceListUsers(t *testing.T) {
	_, authSvc, ctx := newAdminTestSvc(t)

	_, err := authSvc.CreateUser(ctx, "listme1@graphene-lab.org", "List Me 1")
	if err != nil {
		t.Fatalf("CreateUser 1: %v", err)
	}
	_, err = authSvc.CreateUser(ctx, "listme2@graphene-lab.org", "List Me 2")
	if err != nil {
		t.Fatalf("CreateUser 2: %v", err)
	}

	users, err := authSvc.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) < 2 {
		t.Errorf("expected at least 2 users, got %d", len(users))
	}
}

func TestAuthServiceSetUserStatus(t *testing.T) {
	_, authSvc, ctx := newAdminTestSvc(t)

	u, err := authSvc.CreateUser(ctx, "statuschange@graphene-lab.org", "Status Change")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if u.Status != "pending" {
		t.Errorf("expected pending, got %q", u.Status)
	}

	if err := authSvc.SetUserStatus(ctx, u.ID, "approved"); err != nil {
		t.Fatalf("SetUserStatus: %v", err)
	}

	updated, err := authSvc.GetUserByID(ctx, u.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if updated.Status != "approved" {
		t.Errorf("expected approved, got %q", updated.Status)
	}
}

func TestAuthServiceSetUserGlobalRole(t *testing.T) {
	_, authSvc, ctx := newAdminTestSvc(t)

	u, err := authSvc.CreateUser(ctx, "rolechange@graphene-lab.org", "Role Change")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	if err := authSvc.SetUserGlobalRole(ctx, u.ID, "pi"); err != nil {
		t.Fatalf("SetUserGlobalRole: %v", err)
	}

	updated, err := authSvc.GetUserByID(ctx, u.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if updated.GlobalRole != "pi" {
		t.Errorf("expected pi, got %q", updated.GlobalRole)
	}
}

func TestAuthServiceDeleteUser(t *testing.T) {
	_, authSvc, ctx := newAdminTestSvc(t)

	u, err := authSvc.CreateUser(ctx, "deleteme@graphene-lab.org", "Delete Me")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	if err := authSvc.DeleteUser(ctx, u.ID); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}

	_, err = authSvc.GetUserByID(ctx, u.ID)
	if err == nil {
		t.Fatal("expected not-found after DeleteUser")
	}
}

func TestAuthServiceDeleteUser_NotFound(t *testing.T) {
	_, authSvc, ctx := newAdminTestSvc(t)

	err := authSvc.DeleteUser(ctx, uuid.New())
	if err == nil {
		t.Fatal("expected not-found error for unknown user")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.GetStatus() != 404 {
		t.Errorf("expected HTTP 404, got %d", em.GetStatus())
	}
}
