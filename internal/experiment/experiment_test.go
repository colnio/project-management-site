package experiment_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/experiment"
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

// ─── Test environment ─────────────────────────────────────────────────────────

type testEnv struct {
	pool    *pgxpool.Pool
	orgSvc  *org.Service
	projSvc *project.Service
	expSvc  *experiment.Service
	users   *fakeUsers
	rec     *capturingRecorder
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"experiment_samples", "experiments",
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
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	orgSvc := org.NewService(pool, cfg, audit.Nop{}, fu, log)
	projSvc := project.NewService(pool, orgSvc, fu, rec, log)
	expSvc := experiment.NewService(pool, projSvc, rec, log)
	return &testEnv{
		pool:    pool,
		orgSvc:  orgSvc,
		projSvc: projSvc,
		expSvc:  expSvc,
		users:   fu,
		rec:     rec,
	}
}

func principal(u *auth.User) *platform.Principal {
	return &platform.Principal{UserID: u.ID, Email: u.Email}
}

// seedProject creates a workspace (with owner as member) and a workspace-visible project.
func (env *testEnv) seedProject(t *testing.T, ctx context.Context) (*auth.User, uuid.UUID) {
	t.Helper()
	owner := env.users.seed(t, "owner@example.com", "Owner")
	ws, err := env.orgSvc.CreateWorkspace(ctx, "Test WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "Test Project", "", "workspace", owner.ID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	return owner, proj.ID
}

// ─── Create experiment tests ──────────────────────────────────────────────────

func TestCreateExperiment_Success(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	params := json.RawMessage(`{"voltage": 1.5}`)
	exp, err := env.expSvc.CreateExperiment(ctx, projID, "cycling", nil, params, "some result", nil, "planned", nil, owner.ID)
	if err != nil {
		t.Fatalf("create experiment: %v", err)
	}
	if exp.ID == uuid.Nil {
		t.Fatal("expected non-nil experiment ID")
	}
	if exp.Method != "cycling" {
		t.Errorf("method mismatch: %s", exp.Method)
	}
	if exp.Status != "planned" {
		t.Errorf("status mismatch: %s", exp.Status)
	}
	if exp.ProjectID != projID {
		t.Errorf("project_id mismatch")
	}

	// Audit entry recorded.
	if !env.rec.hasAction("experiment.create") {
		t.Error("expected experiment.create audit entry")
	}
}

func TestCreateExperiment_NonEditorForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)
	viewer := env.users.seed(t, "viewer@example.com", "Viewer")

	// Create private project so we can set explicit viewer role.
	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS2", owner.ID)
	privProj, _ := env.projSvc.CreateProject(ctx, ws.ID, "Private", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, privProj.ID, viewer.ID, org.RoleViewer)

	// Viewer tries to create — Authorize(RoleEditor) should return 403.
	_, _, err := env.projSvc.Authorize(ctx, principal(viewer), privProj.ID, org.RoleEditor)
	if err == nil {
		t.Fatal("expected forbidden")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
	_ = projID
}

func TestCreateExperiment_ViewerCannotCreate(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner2@example.com", "Owner2")
	viewer := env.users.seed(t, "viewer2@example.com", "Viewer2")

	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS3", owner.ID)
	privProj, _ := env.projSvc.CreateProject(ctx, ws.ID, "PPrivate", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, privProj.ID, viewer.ID, org.RoleViewer)

	_, _, err := env.projSvc.Authorize(ctx, principal(viewer), privProj.ID, org.RoleEditor)
	if err == nil {
		t.Fatal("viewer should not be able to create experiments")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
}

// ─── List experiment tests ────────────────────────────────────────────────────

func TestListExperiments_MethodFilter(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	// Create two experiments with different methods.
	_, err := env.expSvc.CreateExperiment(ctx, projID, "SEM", nil, nil, "", nil, "planned", nil, owner.ID)
	if err != nil {
		t.Fatalf("create SEM experiment: %v", err)
	}
	_, err = env.expSvc.CreateExperiment(ctx, projID, "XRD", nil, nil, "", nil, "planned", nil, owner.ID)
	if err != nil {
		t.Fatalf("create XRD experiment: %v", err)
	}

	// Filter by method = SEM.
	list, err := env.expSvc.ListExperiments(ctx, projID, nil, "SEM", nil)
	if err != nil {
		t.Fatalf("list experiments: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 SEM experiment, got %d", len(list))
	}
	if list[0].Method != "SEM" {
		t.Errorf("unexpected method: %s", list[0].Method)
	}
}

func TestListExperiments_SampleIDFilter(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	exp1, _ := env.expSvc.CreateExperiment(ctx, projID, "custom", nil, nil, "", nil, "planned", nil, owner.ID)
	exp2, _ := env.expSvc.CreateExperiment(ctx, projID, "custom", nil, nil, "", nil, "planned", nil, owner.ID)

	sampleID := uuid.New()
	_ = env.expSvc.LinkSample(ctx, exp1.ID, sampleID, nil, "", owner.ID)

	list, err := env.expSvc.ListExperiments(ctx, projID, nil, "", &sampleID)
	if err != nil {
		t.Fatalf("list with sample filter: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 experiment with sampleID, got %d", len(list))
	}
	if list[0].ID != exp1.ID {
		t.Errorf("wrong experiment returned")
	}
	_ = exp2
}

func TestListExperiments_IterationFilter(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	iterID := uuid.New()
	_, _ = env.expSvc.CreateExperiment(ctx, projID, "custom", nil, nil, "", &iterID, "planned", nil, owner.ID)
	_, _ = env.expSvc.CreateExperiment(ctx, projID, "custom", nil, nil, "", nil, "planned", nil, owner.ID)

	list, err := env.expSvc.ListExperiments(ctx, projID, &iterID, "", nil)
	if err != nil {
		t.Fatalf("list with iteration filter: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 experiment with iterID, got %d", len(list))
	}
	if *list[0].IterationID != iterID {
		t.Errorf("wrong iteration_id")
	}
}

// ─── Get experiment tests ─────────────────────────────────────────────────────

func TestGetExperiment_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	_, err := env.expSvc.GetExperiment(ctx, uuid.New())
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404 platform error, got %v", err)
	}
}

func TestGetExperiment_Success(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	created, _ := env.expSvc.CreateExperiment(ctx, projID, "EIS", nil, nil, "result", nil, "completed", nil, owner.ID)

	got, err := env.expSvc.GetExperiment(ctx, created.ID)
	if err != nil {
		t.Fatalf("get experiment: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID mismatch")
	}
	if got.Method != "EIS" {
		t.Errorf("method mismatch: %s", got.Method)
	}
}

// ─── Patch experiment tests ───────────────────────────────────────────────────

func TestPatchExperiment_StatusAndParameters(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	exp, _ := env.expSvc.CreateExperiment(ctx, projID, "custom", nil, json.RawMessage(`{}`), "", nil, "planned", nil, owner.ID)

	newParams := json.RawMessage(`{"temp": 25}`)
	resultSummary := "updated result"
	updated, err := env.expSvc.UpdateExperiment(ctx, exp.ID, "", nil, newParams, &resultSummary, nil, false, "completed", nil, owner.ID)
	if err != nil {
		t.Fatalf("update experiment: %v", err)
	}
	if updated.Status != "completed" {
		t.Errorf("expected status=completed, got %s", updated.Status)
	}
	if updated.ResultSummary != "updated result" {
		t.Errorf("result_summary mismatch: %s", updated.ResultSummary)
	}

	// Check parameters were replaced.
	var params map[string]any
	if err := json.Unmarshal(updated.Parameters, &params); err != nil {
		t.Fatalf("unmarshal params: %v", err)
	}
	if _, ok := params["temp"]; !ok {
		t.Error("expected temp key in parameters")
	}

	if !env.rec.hasAction("experiment.update") {
		t.Error("expected experiment.update audit entry")
	}
}

// ─── Sample link/unlink/list tests ───────────────────────────────────────────

func TestSampleLinkUnlinkList(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	exp, _ := env.expSvc.CreateExperiment(ctx, projID, "custom", nil, nil, "", nil, "planned", nil, owner.ID)

	sampleID := uuid.New()
	role := "subject"

	// Link.
	if err := env.expSvc.LinkSample(ctx, exp.ID, sampleID, &role, "test note", owner.ID); err != nil {
		t.Fatalf("link sample: %v", err)
	}
	if !env.rec.hasAction("experiment.sample_link") {
		t.Error("expected experiment.sample_link audit entry")
	}

	// List — should have 1 sample.
	samples, err := env.expSvc.ListSamples(ctx, exp.ID)
	if err != nil {
		t.Fatalf("list samples: %v", err)
	}
	if len(samples) != 1 {
		t.Fatalf("expected 1 sample, got %d", len(samples))
	}
	if samples[0].SampleID != sampleID {
		t.Errorf("sample_id mismatch")
	}
	if samples[0].Role == nil || *samples[0].Role != "subject" {
		t.Errorf("role mismatch: %v", samples[0].Role)
	}
	if samples[0].Note != "test note" {
		t.Errorf("note mismatch: %s", samples[0].Note)
	}

	// Unlink.
	if err := env.expSvc.UnlinkSample(ctx, exp.ID, sampleID, owner.ID); err != nil {
		t.Fatalf("unlink sample: %v", err)
	}
	if !env.rec.hasAction("experiment.sample_unlink") {
		t.Error("expected experiment.sample_unlink audit entry")
	}

	// List again — should be empty.
	samples2, err := env.expSvc.ListSamples(ctx, exp.ID)
	if err != nil {
		t.Fatalf("list samples after unlink: %v", err)
	}
	if len(samples2) != 0 {
		t.Errorf("expected 0 samples after unlink, got %d", len(samples2))
	}
}

func TestSampleUnlink_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)
	exp, _ := env.expSvc.CreateExperiment(ctx, projID, "custom", nil, nil, "", nil, "planned", nil, owner.ID)

	err := env.expSvc.UnlinkSample(ctx, exp.ID, uuid.New(), owner.ID)
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404, got %v", err)
	}
}

func TestSampleLink_Upsert(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)
	exp, _ := env.expSvc.CreateExperiment(ctx, projID, "custom", nil, nil, "", nil, "planned", nil, owner.ID)

	sampleID := uuid.New()
	role1 := "subject"
	role2 := "reference"

	_ = env.expSvc.LinkSample(ctx, exp.ID, sampleID, &role1, "first note", owner.ID)
	// Upsert — should update role and note.
	_ = env.expSvc.LinkSample(ctx, exp.ID, sampleID, &role2, "updated note", owner.ID)

	samples, _ := env.expSvc.ListSamples(ctx, exp.ID)
	if len(samples) != 1 {
		t.Fatalf("expected 1 sample after upsert, got %d", len(samples))
	}
	if samples[0].Role == nil || *samples[0].Role != "reference" {
		t.Errorf("expected role=reference after upsert")
	}
}

// ─── Audit capture test ───────────────────────────────────────────────────────

func TestAudit_ExperimentCreate(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	env.rec.entries = nil // reset

	_, err := env.expSvc.CreateExperiment(ctx, projID, "custom", nil, nil, "", nil, "planned", nil, owner.ID)
	if err != nil {
		t.Fatalf("create experiment: %v", err)
	}

	if !env.rec.hasAction("experiment.create") {
		t.Error("expected experiment.create audit entry")
	}

	// Verify the audit entry has the right actor.
	found := false
	for _, e := range env.rec.entries {
		if e.Action == "experiment.create" && e.Actor == owner.ID {
			found = true
			break
		}
	}
	if !found {
		t.Error("audit entry actor does not match owner")
	}
}

func TestCreateExperiment_DefaultsApplied(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	// Create with empty method and status — defaults should apply.
	exp, err := env.expSvc.CreateExperiment(ctx, projID, "", nil, nil, "", nil, "", nil, owner.ID)
	if err != nil {
		t.Fatalf("create experiment: %v", err)
	}
	if exp.Method != "custom" {
		t.Errorf("expected default method=custom, got %s", exp.Method)
	}
	if exp.Status != "planned" {
		t.Errorf("expected default status=planned, got %s", exp.Status)
	}
}

func TestGetExperiment_WithPerformedAt(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, projID := env.seedProject(t, ctx)

	ts := time.Now().UTC().Truncate(time.Second)
	exp, err := env.expSvc.CreateExperiment(ctx, projID, "weighing", nil, nil, "", nil, "in_progress", &ts, owner.ID)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := env.expSvc.GetExperiment(ctx, exp.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.PerformedAt == nil {
		t.Fatal("expected performed_at to be set")
	}
	if !got.PerformedAt.Truncate(time.Second).Equal(ts) {
		t.Errorf("performed_at mismatch: got %v, want %v", got.PerformedAt, ts)
	}
}
