package iteration_test

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
	"github.com/colnio/project-management-site/internal/iteration"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Fake / capture helpers ───────────────────────────────────────────────────

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

func (f *fakeUsers) GetUsersByIDs(_ context.Context, ids []uuid.UUID) (map[uuid.UUID]*auth.User, error) {
	out := make(map[uuid.UUID]*auth.User, len(ids))
	for _, id := range ids {
		if u, ok := f.byID[id]; ok {
			out[id] = u
		}
	}
	return out, nil
}

func (f *fakeUsers) CreateUser(_ context.Context, _, _ string) (*auth.User, error) {
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
	iterSvc *iteration.Service
	users   *fakeUsers
	rec     *capturingRecorder
}

func nopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"iteration_samples", "iterations",
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
	iterSvc := iteration.NewService(pool, projSvc, rec, log)
	return &testEnv{
		pool:    pool,
		orgSvc:  orgSvc,
		projSvc: projSvc,
		iterSvc: iterSvc,
		users:   fu,
		rec:     rec,
	}
}

func principal(u *auth.User) *platform.Principal {
	return &platform.Principal{UserID: u.ID, Email: u.Email}
}

// helper: create a workspace + project quickly
func setupProject(t *testing.T, env *testEnv, owner *auth.User) *project.Project {
	t.Helper()
	ctx := context.Background()
	ws, err := env.orgSvc.CreateWorkspace(ctx, "Test WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "Test Project", "", "workspace", owner.ID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	return proj
}

// ─── CreateIteration tests ────────────────────────────────────────────────────

func TestCreateIteration_EditorSucceeds(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)

	it, err := env.iterSvc.CreateIteration(ctx, proj.ID, "Sprint 1", "First sprint", "planned", nil, nil, owner.ID)
	if err != nil {
		t.Fatalf("create iteration: %v", err)
	}
	if it.ID == uuid.Nil {
		t.Fatal("expected non-nil iteration ID")
	}
	if it.Title != "Sprint 1" {
		t.Errorf("title mismatch: %s", it.Title)
	}
	if it.Status != "planned" {
		t.Errorf("status mismatch: %s", it.Status)
	}
	if it.ProjectID != proj.ID {
		t.Errorf("project_id mismatch")
	}
	if it.Position != 1 {
		t.Errorf("expected position 1, got %d", it.Position)
	}
	if !env.rec.hasAction("iteration.create") {
		t.Error("expected iteration.create audit entry")
	}
}

func TestCreateIteration_NonEditorForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	viewer := env.users.seed(t, "viewer@example.com", "Viewer")
	proj := setupProject(t, env, owner)

	// Add viewer as explicit collaborator with only viewer role on private project.
	privWs, _ := env.orgSvc.CreateWorkspace(ctx, "Private WS", owner.ID)
	privProj, _ := env.projSvc.CreateProject(ctx, privWs.ID, "Private P", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, privProj.ID, viewer.ID, org.RoleViewer)

	p := principal(viewer)
	// Authorize via projects.Authorize — viewer should not be able to write.
	_, _, err := env.projSvc.Authorize(ctx, p, privProj.ID, org.RoleEditor)
	if err == nil {
		t.Fatal("expected forbidden for viewer trying to create iteration")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403 forbidden, got %v", err)
	}
	_ = proj
}

// ─── List by position ─────────────────────────────────────────────────────────

func TestListIterations_OrderedByPosition(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)

	// Create 3 iterations — should get positions 1, 2, 3
	for _, title := range []string{"First", "Second", "Third"} {
		_, err := env.iterSvc.CreateIteration(ctx, proj.ID, title, "", "planned", nil, nil, owner.ID)
		if err != nil {
			t.Fatalf("create iteration %s: %v", title, err)
		}
	}

	list, err := env.iterSvc.ListIterations(ctx, proj.ID)
	if err != nil {
		t.Fatalf("list iterations: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("expected 3 iterations, got %d", len(list))
	}
	// Verify ascending position order.
	for i := 1; i < len(list); i++ {
		if list[i].Position <= list[i-1].Position {
			t.Errorf("iterations not in ascending position order at index %d", i)
		}
	}
	if list[0].Title != "First" {
		t.Errorf("expected First, got %s", list[0].Title)
	}
}

// ─── GetIteration tests ───────────────────────────────────────────────────────

func TestGetIteration_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	_, err := env.iterSvc.GetIteration(ctx, uuid.New())
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404 platform error, got %v", err)
	}
}

func TestGetIteration_Success(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)
	created, _ := env.iterSvc.CreateIteration(ctx, proj.ID, "Sprint", "desc", "active", nil, nil, owner.ID)

	got, err := env.iterSvc.GetIteration(ctx, created.ID)
	if err != nil {
		t.Fatalf("get iteration: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID mismatch")
	}
	if got.Status != "active" {
		t.Errorf("status mismatch: %s", got.Status)
	}
}

// ─── UpdateIteration tests ────────────────────────────────────────────────────

func TestUpdateIteration_PatchStatus(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)
	it, _ := env.iterSvc.CreateIteration(ctx, proj.ID, "Sprint 1", "", "planned", nil, nil, owner.ID)

	newStatus := "active"
	updated, err := env.iterSvc.UpdateIteration(ctx, it.ID, nil, nil, &newStatus, nil, nil, nil, owner.ID)
	if err != nil {
		t.Fatalf("update iteration: %v", err)
	}
	if updated.Status != "active" {
		t.Errorf("expected status=active, got %s", updated.Status)
	}
	if updated.Title != it.Title {
		t.Errorf("title should not change: got %s", updated.Title)
	}
	if !env.rec.hasAction("iteration.update") {
		t.Error("expected iteration.update audit entry")
	}
}

func TestUpdateIteration_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	title := "x"
	_, err := env.iterSvc.UpdateIteration(ctx, uuid.New(), &title, nil, nil, nil, nil, nil, owner.ID)
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404, got %v", err)
	}
}

// ─── DeleteIteration tests ────────────────────────────────────────────────────

func TestDeleteIteration_Success(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)
	it, _ := env.iterSvc.CreateIteration(ctx, proj.ID, "Sprint X", "", "planned", nil, nil, owner.ID)

	if err := env.iterSvc.DeleteIteration(ctx, it.ID, owner.ID); err != nil {
		t.Fatalf("delete iteration: %v", err)
	}

	_, err := env.iterSvc.GetIteration(ctx, it.ID)
	if err == nil {
		t.Fatal("expected not-found after delete")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404 after delete, got %v", err)
	}
	if !env.rec.hasAction("iteration.delete") {
		t.Error("expected iteration.delete audit entry")
	}
}

func TestDeleteIteration_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	err := env.iterSvc.DeleteIteration(ctx, uuid.New(), owner.ID)
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404, got %v", err)
	}
}

// ─── Sample link/unlink/list round-trip ───────────────────────────────────────

func TestSampleLinkUnlinkList_RoundTrip(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)
	it, _ := env.iterSvc.CreateIteration(ctx, proj.ID, "Sprint 1", "", "planned", nil, nil, owner.ID)

	sampleID := uuid.New() // bare UUID, no FK
	role := "input"
	note := "primary substrate"

	// Link
	is, err := env.iterSvc.LinkSample(ctx, it.ID, sampleID, &role, note, owner.ID)
	if err != nil {
		t.Fatalf("link sample: %v", err)
	}
	if is.SampleID != sampleID {
		t.Errorf("sample_id mismatch")
	}
	if is.Role == nil || *is.Role != "input" {
		t.Errorf("role mismatch")
	}
	if is.Note != note {
		t.Errorf("note mismatch: %s", is.Note)
	}
	if !env.rec.hasAction("iteration.sample_link") {
		t.Error("expected iteration.sample_link audit entry")
	}

	// List
	samples, err := env.iterSvc.ListSamples(ctx, it.ID)
	if err != nil {
		t.Fatalf("list samples: %v", err)
	}
	if len(samples) != 1 {
		t.Fatalf("expected 1 sample, got %d", len(samples))
	}
	if samples[0].SampleID != sampleID {
		t.Errorf("listed sample_id mismatch")
	}

	// Upsert (conflict → update)
	newRole := "output"
	isUpdated, err := env.iterSvc.LinkSample(ctx, it.ID, sampleID, &newRole, "updated note", owner.ID)
	if err != nil {
		t.Fatalf("upsert sample: %v", err)
	}
	if isUpdated.Role == nil || *isUpdated.Role != "output" {
		t.Errorf("expected role=output after upsert")
	}
	if isUpdated.Note != "updated note" {
		t.Errorf("expected updated note after upsert")
	}

	// Still 1 sample (upserted, not duplicated)
	samples2, _ := env.iterSvc.ListSamples(ctx, it.ID)
	if len(samples2) != 1 {
		t.Errorf("expected 1 sample after upsert, got %d", len(samples2))
	}

	// Unlink
	if err := env.iterSvc.UnlinkSample(ctx, it.ID, sampleID, owner.ID); err != nil {
		t.Fatalf("unlink sample: %v", err)
	}
	if !env.rec.hasAction("iteration.sample_unlink") {
		t.Error("expected iteration.sample_unlink audit entry")
	}

	// Empty list
	samples3, _ := env.iterSvc.ListSamples(ctx, it.ID)
	if len(samples3) != 0 {
		t.Errorf("expected 0 samples after unlink, got %d", len(samples3))
	}
}

// ─── Viewer cannot link samples ───────────────────────────────────────────────

func TestLinkSample_ViewerForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	viewer := env.users.seed(t, "viewer@example.com", "Viewer")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, proj.ID, viewer.ID, org.RoleViewer)

	it, _ := env.iterSvc.CreateIteration(ctx, proj.ID, "Sprint", "", "planned", nil, nil, owner.ID)

	// Viewer tries to check authorization for write — should fail.
	_, _, err := env.projSvc.Authorize(ctx, principal(viewer), proj.ID, org.RoleEditor)
	if err == nil {
		t.Fatal("expected forbidden for viewer trying to link sample")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
	_ = it
}

// ─── Audit: iteration.create recorded ─────────────────────────────────────────

func TestAudit_CreateRecorded(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)

	env.rec.entries = nil // reset
	_, err := env.iterSvc.CreateIteration(ctx, proj.ID, "Audit Sprint", "", "planned", nil, nil, owner.ID)
	if err != nil {
		t.Fatalf("create iteration: %v", err)
	}
	if !env.rec.hasAction("iteration.create") {
		t.Error("expected iteration.create audit entry to be recorded")
	}
	// Verify the actor matches.
	for _, e := range env.rec.entries {
		if e.Action == "iteration.create" && e.Actor != owner.ID {
			t.Errorf("expected actor=%v, got %v", owner.ID, e.Actor)
		}
	}
}

// ─── StartAt/EndAt round-trip ─────────────────────────────────────────────────

func TestCreateIteration_WithDates(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)

	start := time.Now().UTC().Truncate(time.Millisecond)
	end := start.Add(7 * 24 * time.Hour)
	it, err := env.iterSvc.CreateIteration(ctx, proj.ID, "Timed Sprint", "", "planned", &start, &end, owner.ID)
	if err != nil {
		t.Fatalf("create iteration with dates: %v", err)
	}
	if it.StartAt == nil || it.StartAt.IsZero() {
		t.Error("expected StartAt to be set")
	}
	if it.EndAt == nil || it.EndAt.IsZero() {
		t.Error("expected EndAt to be set")
	}
}
