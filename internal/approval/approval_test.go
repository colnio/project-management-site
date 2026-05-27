package approval_test

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/ai"
	"github.com/colnio/project-management-site/internal/approval"
	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/inbox"
	"github.com/colnio/project-management-site/internal/iteration"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/risk"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

func nopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

type capturingRecorder struct {
	entries []audit.Entry
}

func (r *capturingRecorder) Record(_ context.Context, e audit.Entry) error {
	r.entries = append(r.entries, e)
	return nil
}

func (r *capturingRecorder) hasAction(action string) bool {
	for _, e := range r.entries {
		if e.Action == action {
			return true
		}
	}
	return false
}

type fakeUsers struct {
	byEmail map[string]*auth.User
	byID    map[uuid.UUID]*auth.User
	pool    *pgxpool.Pool
}

func newFakeUsers(pool *pgxpool.Pool) *fakeUsers {
	return &fakeUsers{
		byEmail: make(map[string]*auth.User),
		byID:    make(map[uuid.UUID]*auth.User),
		pool:    pool,
	}
}

func (f *fakeUsers) seed(t *testing.T, email, displayName string) *auth.User {
	t.Helper()
	u := &auth.User{
		ID:          uuid.New(),
		Email:       email,
		DisplayName: displayName,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	_, err := f.pool.Exec(context.Background(),
		`INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		u.ID, u.Email, u.DisplayName,
	)
	if err != nil {
		t.Fatalf("fakeUsers.seed %s: %v", email, err)
	}
	f.byEmail[email] = u
	f.byID[u.ID] = u
	return u
}

func (f *fakeUsers) GetUserByEmail(_ context.Context, email string) (*auth.User, error) {
	u, ok := f.byEmail[email]
	if !ok {
		return nil, platform.NotFound("user.not_found", "user not found")
	}
	return u, nil
}
func (f *fakeUsers) GetUserByID(_ context.Context, id uuid.UUID) (*auth.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, platform.NotFound("user.not_found", "user not found")
	}
	return u, nil
}
func (f *fakeUsers) CreateUser(_ context.Context, _, _ string) (*auth.User, error) {
	return nil, platform.BadRequest("not_supported", "not supported in tests")
}
func (f *fakeUsers) SetPassword(_ context.Context, _ uuid.UUID, _ string) error { return nil }

// ─── Test environment ─────────────────────────────────────────────────────────

type testEnv struct {
	pool        *pgxpool.Pool
	orgSvc      *org.Service
	projSvc     *project.Service
	approvalSvc *approval.Service
	inboxSvc    *inbox.Service
	users       *fakeUsers
	rec         *capturingRecorder
}

var truncateTables = []string{
	"approval_requests",
	"audit_log",
	"risks", "iterations",
	"ai_tool_calls", "ai_messages", "ai_conversations",
	"projects", "project_collaborations", "admin_overrides",
	"workspace_memberships", "workspaces", "users",
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, truncateTables...)

	fu := newFakeUsers(pool)
	rec := &capturingRecorder{}
	log := nopLogger()
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config.Load: %v", err)
	}

	orgSvc := org.NewService(pool, cfg, audit.Nop{}, fu, log)
	projSvc := project.NewService(pool, orgSvc, fu, rec, log)
	approvalSvc := approval.NewService(pool, projSvc, orgSvc, rec, cfg, log)

	// Build inbox with approval for integration test.
	iterSvc := iteration.NewService(pool, projSvc, audit.Nop{}, log)
	riskSvc := risk.NewService(pool, projSvc, iterSvc, audit.Nop{}, log)

	// auth service with a non-existent OIDC issuer (discovery will fail but is OK for tests).
	authSvc, _ := auth.NewService(context.Background(), pool, &config.Config{
		JWTSigningKey:   "test-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		OIDCIssuer:      "http://localhost:9999/nonexistent",
	}, audit.Nop{}, log)
	aiSvc := ai.NewService(pool, cfg, nil, authSvc, orgSvc, projSvc, audit.Nop{}, log)

	inboxSvc := inbox.NewService(pool, orgSvc, riskSvc, aiSvc, projSvc, approvalSvc, log)

	return &testEnv{
		pool:        pool,
		orgSvc:      orgSvc,
		projSvc:     projSvc,
		approvalSvc: approvalSvc,
		inboxSvc:    inboxSvc,
		users:       fu,
		rec:         rec,
	}
}

func principal(u *auth.User) *platform.Principal {
	return &platform.Principal{UserID: u.ID, Email: u.Email}
}

func setupWorkspace(t *testing.T, env *testEnv, owner *auth.User) *org.Workspace {
	t.Helper()
	ws, err := env.orgSvc.CreateWorkspace(context.Background(), "Test WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	return ws
}

func setupProject(t *testing.T, env *testEnv, wsID, ownerID uuid.UUID) *project.Project {
	t.Helper()
	proj, err := env.projSvc.CreateProject(context.Background(), wsID, "Test Project", "", "workspace", ownerID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	return proj
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// TestCreate_InsertsAndSnapshotsRecipients verifies that Create inserts the request,
// snapshots workspace-member and collaborator recipients, and records approval.create audit.
func TestCreate_InsertsAndSnapshotsRecipients(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@approval.test", "Owner")
	member := env.users.seed(t, "member@approval.test", "Member")
	collab := env.users.seed(t, "collab@approval.test", "Collab")

	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	// Add member to workspace.
	if err := env.orgSvc.AddMember(ctx, ws.ID, member.ID, "member", owner.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}
	// Add collab to project.
	if err := env.orgSvc.AddCollaborator(ctx, proj.ID, collab.ID, org.RoleViewer); err != nil {
		t.Fatalf("add collaborator: %v", err)
	}

	recipientIDs := []uuid.UUID{member.ID, collab.ID}
	ar, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil,
		"Deploy to production", "AI review: looks good", recipientIDs)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if ar.ID == uuid.Nil {
		t.Error("expected non-nil ID")
	}
	if ar.Status != "pending" {
		t.Errorf("expected status=pending, got %q", ar.Status)
	}
	if ar.Description != "Deploy to production" {
		t.Errorf("description mismatch: %q", ar.Description)
	}
	if ar.AIReview != "AI review: looks good" {
		t.Errorf("ai_review mismatch: %q", ar.AIReview)
	}

	// Both recipients should be snapshotted.
	if len(ar.Recipients) != 2 {
		t.Errorf("expected 2 recipients, got %d", len(ar.Recipients))
	}
	recipientEmails := make(map[string]bool)
	for _, r := range ar.Recipients {
		recipientEmails[r.Email] = true
	}
	if !recipientEmails["member@approval.test"] {
		t.Error("expected member@approval.test in recipients")
	}
	if !recipientEmails["collab@approval.test"] {
		t.Error("expected collab@approval.test in recipients")
	}

	// Audit entry should be recorded.
	if !env.rec.hasAction("approval.create") {
		t.Error("expected approval.create audit entry")
	}
}

// TestCreate_SkipsUnknownRecipients verifies that unknown user IDs are silently
// skipped and Create still succeeds.
func TestCreate_SkipsUnknownRecipients(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner2@approval.test", "Owner2")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	unknownID := uuid.New()
	ar, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil,
		"Test description", "", []uuid.UUID{unknownID})
	if err != nil {
		t.Fatalf("Create with unknown recipient should succeed: %v", err)
	}
	if len(ar.Recipients) != 0 {
		t.Errorf("expected 0 recipients after skipping unknown, got %d", len(ar.Recipients))
	}
}

// TestCreate_SMTPFailureDoesNotFailRequest confirms best-effort email: even when
// SMTP is unreachable the Create call succeeds (SMTP defaults to localhost:1025
// which is not necessarily running in test environments).
func TestCreate_SMTPFailureDoesNotFailRequest(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner3@approval.test", "Owner3")
	member := env.users.seed(t, "member3@approval.test", "Member3")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	if err := env.orgSvc.AddMember(ctx, ws.ID, member.ID, "member", owner.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	// Include member as recipient so email is attempted.
	ar, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil,
		"SMTP test", "ai review", []uuid.UUID{member.ID})
	// Create must succeed regardless of SMTP outcome.
	if err != nil {
		t.Fatalf("Create must not fail when SMTP is unreachable: %v", err)
	}
	if ar.ID == uuid.Nil {
		t.Error("expected non-nil ID")
	}
}

// TestDecide_Approve verifies that a recipient can approve a pending request.
func TestDecide_Approve(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner4@approval.test", "Owner4")
	recipient := env.users.seed(t, "recip4@approval.test", "Recip4")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	if err := env.orgSvc.AddMember(ctx, ws.ID, recipient.ID, "member", owner.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	ar, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil,
		"Approve me", "", []uuid.UUID{recipient.ID})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	env.rec.entries = nil // reset

	if err := env.approvalSvc.Decide(ctx, principal(recipient), ar.ID, true); err != nil {
		t.Fatalf("Decide approve: %v", err)
	}

	updated, err := env.approvalSvc.Get(ctx, ar.ID)
	if err != nil {
		t.Fatalf("Get after decide: %v", err)
	}
	if updated.Status != "approved" {
		t.Errorf("expected status=approved, got %q", updated.Status)
	}
	if updated.DecidedBy == nil || *updated.DecidedBy != recipient.ID {
		t.Errorf("expected decided_by=%v, got %v", recipient.ID, updated.DecidedBy)
	}
	if updated.DecidedAt == nil {
		t.Error("expected decided_at to be set")
	}

	if !env.rec.hasAction("approval.decide") {
		t.Error("expected approval.decide audit entry")
	}
}

// TestDecide_Reject verifies that a project editor can reject a pending request.
func TestDecide_Reject(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner5@approval.test", "Owner5")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	ar, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil,
		"Reject me", "", nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := env.approvalSvc.Decide(ctx, principal(owner), ar.ID, false); err != nil {
		t.Fatalf("Decide reject: %v", err)
	}

	updated, err := env.approvalSvc.Get(ctx, ar.ID)
	if err != nil {
		t.Fatalf("Get after decide: %v", err)
	}
	if updated.Status != "rejected" {
		t.Errorf("expected status=rejected, got %q", updated.Status)
	}
}

// TestDecide_AlreadyDecidedFails verifies that deciding on a non-pending request fails.
func TestDecide_AlreadyDecidedFails(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner6@approval.test", "Owner6")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	ar, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil,
		"Already decided", "", nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := env.approvalSvc.Decide(ctx, principal(owner), ar.ID, true); err != nil {
		t.Fatalf("first Decide: %v", err)
	}

	err = env.approvalSvc.Decide(ctx, principal(owner), ar.ID, false)
	if err == nil {
		t.Fatal("expected error on second Decide, got nil")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.Code != "approval.already_decided" {
		t.Errorf("expected code approval.already_decided, got %q", em.Code)
	}
}

// TestDecide_NonRecipientNonEditorForbidden verifies that a random user cannot decide.
func TestDecide_NonRecipientNonEditorForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner7@approval.test", "Owner7")
	outsider := env.users.seed(t, "outsider7@approval.test", "Outsider7")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	ar, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil,
		"Forbidden test", "", nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// outsider is not a recipient and not a project editor.
	err = env.approvalSvc.Decide(ctx, principal(outsider), ar.ID, true)
	if err == nil {
		t.Fatal("expected forbidden error, got nil")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected 403, got %d", em.GetStatus())
	}
}

// TestListPendingByWorkspace_OnlyPendingInWorkspace verifies that only pending
// requests from projects in the workspace are returned.
func TestListPendingByWorkspace_OnlyPendingInWorkspace(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner8@approval.test", "Owner8")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	// Create a second workspace with its own project (should not appear).
	owner2 := env.users.seed(t, "owner8b@approval.test", "Owner8b")
	ws2 := setupWorkspace(t, env, owner2)
	proj2 := setupProject(t, env, ws2.ID, owner2.ID)

	// Two pending requests in ws.
	ar1, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil, "First", "", nil)
	if err != nil {
		t.Fatalf("Create ar1: %v", err)
	}
	ar2, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil, "Second", "", nil)
	if err != nil {
		t.Fatalf("Create ar2: %v", err)
	}

	// One request in ws2.
	_, err = env.approvalSvc.Create(ctx, principal(owner2), proj2.ID, nil, "Other ws", "", nil)
	if err != nil {
		t.Fatalf("Create ws2 ar: %v", err)
	}

	// Approve one from ws (should not appear as pending).
	if err := env.approvalSvc.Decide(ctx, principal(owner), ar1.ID, true); err != nil {
		t.Fatalf("Decide ar1: %v", err)
	}

	items, err := env.approvalSvc.ListPendingByWorkspace(ctx, ws.ID, 50)
	if err != nil {
		t.Fatalf("ListPendingByWorkspace: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 pending item in ws, got %d", len(items))
	}
	if items[0].ID != ar2.ID {
		t.Errorf("expected pending item to be ar2 (%v), got %v", ar2.ID, items[0].ID)
	}
}

// TestListByProject_ReturnsAll verifies that ListByProject returns all statuses.
func TestListByProject_ReturnsAll(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner9@approval.test", "Owner9")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	ar1, _ := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil, "A", "", nil)
	ar2, _ := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil, "B", "", nil)

	if err := env.approvalSvc.Decide(ctx, principal(owner), ar1.ID, true); err != nil {
		t.Fatalf("Decide: %v", err)
	}

	list, err := env.approvalSvc.ListByProject(ctx, proj.ID)
	if err != nil {
		t.Fatalf("ListByProject: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 items, got %d", len(list))
	}
	ids := map[uuid.UUID]bool{}
	for _, item := range list {
		ids[item.ID] = true
	}
	if !ids[ar1.ID] || !ids[ar2.ID] {
		t.Error("expected both ar1 and ar2 in list")
	}
}

// TestInbox_PendingApprovalAppearsAsApprovalKind verifies that a pending approval
// request appears in the inbox as a kind="approval" item.
func TestInbox_PendingApprovalAppearsAsApprovalKind(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner10@approval.test", "Owner10")
	ws := setupWorkspace(t, env, owner)
	proj := setupProject(t, env, ws.ID, owner.ID)

	ar, err := env.approvalSvc.Create(ctx, principal(owner), proj.ID, nil,
		"Inbox test approval", "ai review text", nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	items, err := env.inboxSvc.AggregateForWorkspace(ctx, ws.ID)
	if err != nil {
		t.Fatalf("AggregateForWorkspace: %v", err)
	}

	found := false
	for _, item := range items {
		if item.Kind == "approval" && item.ID == ar.ID {
			found = true
			if item.Title != "Approval Request Pending" {
				t.Errorf("unexpected approval title: %q", item.Title)
			}
			expectedLink := "/projects/" + proj.ID.String()
			if item.Link != expectedLink {
				t.Errorf("unexpected approval link: %q, want %q", item.Link, expectedLink)
			}
		}
	}
	if !found {
		t.Errorf("expected approval item with ID %v in inbox, got %d items", ar.ID, len(items))
		for _, item := range items {
			t.Logf("  item: kind=%q id=%v title=%q", item.Kind, item.ID, item.Title)
		}
	}
}
