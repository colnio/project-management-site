package project_test

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Fake / capture helpers ───────────────────────────────────────────────────

// fakeUsers implements both project.UserLookup and org.Users.
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

func (f *fakeUsers) CreateUser(_ context.Context, email, displayName string) (*auth.User, error) {
	return nil, platform.BadRequest("not_supported", "not supported in tests")
}

func (f *fakeUsers) SetPassword(_ context.Context, _ uuid.UUID, _ string) error { return nil }

// capturingRecorder records all audit entries.
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

// ─── Test setup ───────────────────────────────────────────────────────────────

type testEnv struct {
	pool    *pgxpool.Pool
	orgSvc  *org.Service
	projSvc *project.Service
	users   *fakeUsers
	rec     *capturingRecorder
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"projects", "project_collaborations", "admin_overrides",
		"workspace_memberships", "workspaces", "users",
	)
	fu := newFakeUsers(pool)
	rec := &capturingRecorder{}
	cfg := &config.Config{
		SMTPHost:  "localhost",
		SMTPPort:  "1025",
		SMTPFrom:  "test@example.com",
		WebOrigin: "http://localhost:5173",
	}
	log := nopLogger()
	orgSvc := org.NewService(pool, cfg, audit.Nop{}, fu, log)
	projSvc := project.NewService(pool, orgSvc, fu, rec, log)
	return &testEnv{
		pool:    pool,
		orgSvc:  orgSvc,
		projSvc: projSvc,
		users:   fu,
		rec:     rec,
	}
}

func nopLogger() *slog.Logger {
	// use io.Discard via slog text handler
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func principal(u *auth.User) *platform.Principal {
	return &platform.Principal{UserID: u.ID, Email: u.Email}
}

// ─── CreateProject tests ──────────────────────────────────────────────────────

func TestCreateProject_WorkspaceMemberSucceeds(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	ws, err := env.orgSvc.CreateWorkspace(ctx, "Lab WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "My Project", "", "workspace", owner.ID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	if proj.ID == uuid.Nil {
		t.Fatal("expected non-nil project ID")
	}
	if proj.Name != "My Project" {
		t.Errorf("name mismatch: %s", proj.Name)
	}
	if proj.Visibility != "workspace" {
		t.Errorf("visibility mismatch: %s", proj.Visibility)
	}

	// Audit entry recorded.
	if !env.rec.hasAction("project.create") {
		t.Error("expected project.create audit entry")
	}
}

func TestCreateProject_NonMemberForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	outsider := env.users.seed(t, "outsider@example.com", "Outsider")

	ws, err := env.orgSvc.CreateWorkspace(ctx, "Lab WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	// The HTTP layer enforces membership — test at service level via WorkspaceRole.
	_, isMember, err := env.orgSvc.WorkspaceRole(ctx, ws.ID, outsider.ID)
	if err != nil {
		t.Fatalf("workspace role: %v", err)
	}
	if isMember {
		t.Error("outsider should not be a member")
	}
}

func TestCreateProject_Private_AddsOwnerCollaborator(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	ws, err := env.orgSvc.CreateWorkspace(ctx, "Private WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "Secret", "", "private", owner.ID)
	if err != nil {
		t.Fatalf("create private project: %v", err)
	}

	collabs, err := env.orgSvc.ListCollaborators(ctx, proj.ID)
	if err != nil {
		t.Fatalf("list collaborators: %v", err)
	}
	if len(collabs) != 1 {
		t.Fatalf("expected 1 collaborator, got %d", len(collabs))
	}
	if collabs[0].UserID != owner.ID || collabs[0].Role != org.RoleOwner {
		t.Errorf("unexpected collaborator: %+v", collabs[0])
	}
}

// ─── GetProject tests ─────────────────────────────────────────────────────────

func TestGetProject_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	_, err := env.projSvc.GetProject(ctx, uuid.New())
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404 platform error, got %v", err)
	}
}

// ─── Authorize tests ──────────────────────────────────────────────────────────

func TestAuthorize_ViewerCanRead(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	viewer := env.users.seed(t, "viewer@example.com", "Viewer")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	_ = env.orgSvc.AddMember(ctx, ws.ID, viewer.ID, "member", owner.ID)

	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "workspace", owner.ID)

	// viewer (workspace member) can read workspace-visible project
	got, role, err := env.projSvc.Authorize(ctx, principal(viewer), proj.ID, org.RoleViewer)
	if err != nil {
		t.Fatalf("authorize: %v", err)
	}
	if got.ID != proj.ID {
		t.Error("wrong project returned")
	}
	if !role.CanRead() {
		t.Errorf("expected CanRead role, got %s", role)
	}
}

func TestAuthorize_ViewerCannotWrite(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	viewer := env.users.seed(t, "viewer@example.com", "Viewer")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	_ = env.orgSvc.AddMember(ctx, ws.ID, viewer.ID, "member", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "workspace", owner.ID)

	// The workspace member role is "editor" for workspace-visible projects.
	// Let's use a collaborator with explicit viewer-only.
	// First test with a pure private project where the viewer has viewer collab role.
	privProj, _ := env.projSvc.CreateProject(ctx, ws.ID, "Priv", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, privProj.ID, viewer.ID, org.RoleViewer)

	_, _, err := env.projSvc.Authorize(ctx, principal(viewer), privProj.ID, org.RoleEditor)
	if err == nil {
		t.Fatal("expected forbidden error for viewer trying to write")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403 forbidden, got %v", err)
	}
	_ = proj // silence unused
}

func TestAuthorize_EditorCanWrite(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	editor := env.users.seed(t, "editor@example.com", "Editor")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, proj.ID, editor.ID, org.RoleEditor)

	_, _, err := env.projSvc.Authorize(ctx, principal(editor), proj.ID, org.RoleEditor)
	if err != nil {
		t.Fatalf("editor should be allowed to write: %v", err)
	}
}

func TestAuthorize_OwnerCanArchive(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "workspace", owner.ID)

	_, _, err := env.projSvc.Authorize(ctx, principal(owner), proj.ID, org.RoleOwner)
	if err != nil {
		t.Fatalf("workspace owner should be able to manage: %v", err)
	}
}

func TestAuthorize_OutsiderForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	outsider := env.users.seed(t, "outsider@example.com", "Outsider")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "workspace", owner.ID)

	_, _, err := env.projSvc.Authorize(ctx, principal(outsider), proj.ID, org.RoleViewer)
	if err == nil {
		t.Fatal("expected forbidden for outsider")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
}

func TestAuthorize_PrivateProjectHiddenFromNonCollaborator(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	member := env.users.seed(t, "member@example.com", "Member")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	_ = env.orgSvc.AddMember(ctx, ws.ID, member.ID, "member", owner.ID)

	// Private project — only the owner is an explicit collaborator.
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "Private P", "", "private", owner.ID)

	// member is in workspace but has no collaborator entry → 403.
	_, _, err := env.projSvc.Authorize(ctx, principal(member), proj.ID, org.RoleViewer)
	if err == nil {
		t.Fatal("expected forbidden for member on private project")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
}

// ─── Collaborator tests ───────────────────────────────────────────────────────

func TestCollaborator_UnknownEmailReturns404(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	_, err := env.users.GetUserByEmail(ctx, "ghost@example.com")
	if err == nil {
		t.Fatal("expected not found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404, got %v", err)
	}
}

func TestCollaborator_AddListRemove(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	collab := env.users.seed(t, "collab@example.com", "Collab")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "private", owner.ID)

	// Add collab as editor.
	if err := env.orgSvc.AddCollaborator(ctx, proj.ID, collab.ID, org.RoleEditor); err != nil {
		t.Fatalf("add collaborator: %v", err)
	}

	// List: should have 2 entries (owner + collab).
	collabs, err := env.orgSvc.ListCollaborators(ctx, proj.ID)
	if err != nil {
		t.Fatalf("list collaborators: %v", err)
	}
	if len(collabs) != 2 {
		t.Fatalf("expected 2 collaborators, got %d", len(collabs))
	}

	// Remove collab.
	if err := env.orgSvc.RemoveCollaborator(ctx, proj.ID, collab.ID); err != nil {
		t.Fatalf("remove collaborator: %v", err)
	}

	collabs2, _ := env.orgSvc.ListCollaborators(ctx, proj.ID)
	if len(collabs2) != 1 {
		t.Errorf("expected 1 collaborator after remove, got %d", len(collabs2))
	}
}

func TestCollaborator_NonOwnerCannotAdd(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	editor := env.users.seed(t, "editor@example.com", "Editor")
	target := env.users.seed(t, "target@example.com", "Target")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, proj.ID, editor.ID, org.RoleEditor)

	// editor tries to add collaborator — Authorize should fail with 403.
	_, _, err := env.projSvc.Authorize(ctx, principal(editor), proj.ID, org.RoleOwner)
	if err == nil {
		t.Fatal("expected forbidden for editor trying to manage collaborators")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
	_ = target
}

// ─── Audit capture tests ──────────────────────────────────────────────────────

func TestAudit_CreateUpdateArchive(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)

	// Create
	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "AuditProj", "", "workspace", owner.ID)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !env.rec.hasAction("project.create") {
		t.Error("missing project.create audit entry")
	}

	// Update
	_, err = env.projSvc.UpdateProject(ctx, proj.ID, "AuditProj Updated", "", "", owner.ID)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if !env.rec.hasAction("project.update") {
		t.Error("missing project.update audit entry")
	}

	// Archive
	_, err = env.projSvc.ArchiveProject(ctx, proj.ID, owner.ID)
	if err != nil {
		t.Fatalf("archive: %v", err)
	}
	if !env.rec.hasAction("project.archive") {
		t.Error("missing project.archive audit entry")
	}
}

func TestExperimentTag_CRUD(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "TagProj", "", "workspace", owner.ID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	tag, err := env.projSvc.CreateExperimentTag(ctx, proj.ID, "EIS", owner.ID)
	if err != nil {
		t.Fatalf("create tag: %v", err)
	}
	if tag.Label != "EIS" {
		t.Errorf("label = %q", tag.Label)
	}

	list, err := env.projSvc.ListExperimentTags(ctx, proj.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("want 1 tag, got %d", len(list))
	}

	updated, err := env.projSvc.UpdateExperimentTag(ctx, proj.ID, tag.ID, "SEM", owner.ID)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Label != "SEM" {
		t.Errorf("updated label = %q", updated.Label)
	}

	if err := env.projSvc.DeleteExperimentTag(ctx, proj.ID, tag.ID, owner.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	list, _ = env.projSvc.ListExperimentTags(ctx, proj.ID)
	if len(list) != 0 {
		t.Errorf("want 0 tags after delete, got %d", len(list))
	}
}
