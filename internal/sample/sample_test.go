package sample_test

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
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/sample"
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

// ─── Test env ─────────────────────────────────────────────────────────────────

type testEnv struct {
	pool      *pgxpool.Pool
	orgSvc    *org.Service
	projSvc   *project.Service
	sampleSvc *sample.Service
	users     *fakeUsers
	rec       *capturingRecorder
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"sample_relations", "samples",
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
	sampleSvc := sample.NewService(pool, projSvc, rec, log)
	return &testEnv{
		pool:      pool,
		orgSvc:    orgSvc,
		projSvc:   projSvc,
		sampleSvc: sampleSvc,
		users:     fu,
		rec:       rec,
	}
}

func nopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func principal(u *auth.User) *platform.Principal {
	return &platform.Principal{UserID: u.ID, Email: u.Email}
}

// setupProjectWithOwner creates a workspace + workspace-visible project + returns owner.
func setupProjectWithOwner(t *testing.T, env *testEnv, emailSuffix string) (*auth.User, *project.Project) {
	t.Helper()
	ctx := context.Background()
	owner := env.users.seed(t, "owner-"+emailSuffix+"@example.com", "Owner "+emailSuffix)
	ws, err := env.orgSvc.CreateWorkspace(ctx, "Lab WS "+emailSuffix, owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "Lab Project "+emailSuffix, "", "workspace", owner.ID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	return owner, proj
}

// insertSample inserts a sample directly (no auth check) for test fixture setup.
func insertSample(t *testing.T, env *testEnv, projID uuid.UUID, identifier string, createdBy uuid.UUID) *sample.Sample {
	t.Helper()
	sm, err := env.sampleSvc.CreateSampleForTest(
		context.Background(), projID, identifier, "", "", "other",
		json.RawMessage("{}"), "active", createdBy,
	)
	if err != nil {
		t.Fatalf("insert sample %s: %v", identifier, err)
	}
	return sm
}

// ─── Create sample tests ───────────────────────────────────────────────────────

func TestCreateSample_Success(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, proj := setupProjectWithOwner(t, env, "create")
	p := principal(owner)

	env.rec.entries = nil // clear project.create audit entries
	sm, err := env.sampleSvc.CreateSampleAuthorized(ctx, p, proj.ID,
		"S-001", "My Sample", "", "other", json.RawMessage("{}"), "active")
	if err != nil {
		t.Fatalf("create sample: %v", err)
	}
	if sm.ID == uuid.Nil {
		t.Fatal("expected non-nil sample ID")
	}
	if sm.Identifier != "S-001" {
		t.Errorf("identifier mismatch: %s", sm.Identifier)
	}
	if sm.Kind != "other" {
		t.Errorf("default kind should be 'other', got %s", sm.Kind)
	}
	if sm.Status != "active" {
		t.Errorf("default status should be 'active', got %s", sm.Status)
	}
	if !env.rec.hasAction("sample.create") {
		t.Error("expected sample.create audit entry")
	}
}

func TestCreateSample_DuplicateIdentifier_Conflict(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, proj := setupProjectWithOwner(t, env, "dup")
	p := principal(owner)

	if _, err := env.sampleSvc.CreateSampleAuthorized(ctx, p, proj.ID,
		"S-DUP", "", "", "other", nil, "active"); err != nil {
		t.Fatalf("first create: %v", err)
	}

	_, err := env.sampleSvc.CreateSampleAuthorized(ctx, p, proj.ID,
		"S-DUP", "", "", "other", nil, "active")
	if err == nil {
		t.Fatal("expected conflict error for duplicate identifier")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 409 {
		t.Errorf("expected 409 conflict, got %v", err)
	}
	if em.Code != "sample.identifier_taken" {
		t.Errorf("expected code sample.identifier_taken, got %s", em.Code)
	}
}

func TestCreateSample_NonEditor_Forbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-ne@example.com", "Owner NE")
	viewer := env.users.seed(t, "viewer-ne@example.com", "Viewer NE")
	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS NE", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "Priv", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, proj.ID, viewer.ID, org.RoleViewer)

	_, err := env.sampleSvc.CreateSampleAuthorized(ctx, principal(viewer), proj.ID,
		"S-VIEWER", "", "", "other", nil, "active")
	if err == nil {
		t.Fatal("expected forbidden for viewer creating sample")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
}

func TestCreateSample_ViewerCannotCreate(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-vc@example.com", "Owner VC")
	viewer := env.users.seed(t, "viewer-vc@example.com", "Viewer VC")
	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS VC", owner.ID)
	proj, _ := env.projSvc.CreateProject(ctx, ws.ID, "P", "", "private", owner.ID)
	_ = env.orgSvc.AddCollaborator(ctx, proj.ID, viewer.ID, org.RoleViewer)

	_, err := env.sampleSvc.CreateSampleAuthorized(ctx, principal(viewer), proj.ID,
		"S-NOPE", "", "", "other", nil, "active")
	if err == nil {
		t.Fatal("viewer should not be allowed to create samples")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
}

// ─── Get sample tests ──────────────────────────────────────────────────────────

func TestGetSample_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	_, err := env.sampleSvc.GetSample(ctx, uuid.New())
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404 platform error, got %v", err)
	}
}

func TestGetSample_Success(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, proj := setupProjectWithOwner(t, env, "get")
	created := insertSample(t, env, proj.ID, "S-FIND", owner.ID)

	found, err := env.sampleSvc.GetSample(ctx, created.ID)
	if err != nil {
		t.Fatalf("get sample: %v", err)
	}
	if found.ID != created.ID {
		t.Errorf("id mismatch")
	}
	if found.Identifier != "S-FIND" {
		t.Errorf("identifier mismatch: %s", found.Identifier)
	}
}

// ─── Patch tests ───────────────────────────────────────────────────────────────

func TestPatchSample_UpdatesProperties(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, proj := setupProjectWithOwner(t, env, "patch")
	sm := insertSample(t, env, proj.ID, "S-PATCH", owner.ID)

	env.rec.entries = nil
	newProps := json.RawMessage(`{"thickness_nm": 42, "substrate": "Si"}`)
	name := "Updated Name"

	updated, err := env.sampleSvc.PatchSampleForTest(ctx, sm.ID, &name, nil, nil, nil, nil, newProps)
	if err != nil {
		t.Fatalf("patch: %v", err)
	}
	if updated.Name != "Updated Name" {
		t.Errorf("name not updated: %s", updated.Name)
	}

	// Verify properties replaced.
	var props map[string]any
	if err := json.Unmarshal(updated.Properties, &props); err != nil {
		t.Fatalf("unmarshal properties: %v", err)
	}
	if props["thickness_nm"] != float64(42) {
		t.Errorf("properties not updated: %v", props)
	}
	if _, ok := props["substrate"]; !ok {
		t.Error("expected substrate key in properties")
	}

	if !env.rec.hasAction("sample.update") {
		t.Error("expected sample.update audit entry")
	}
}

// ─── Relation tests ────────────────────────────────────────────────────────────

func TestAddRelation_Success(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, proj := setupProjectWithOwner(t, env, "rel")
	parent := insertSample(t, env, proj.ID, "S-P", owner.ID)
	child := insertSample(t, env, proj.ID, "S-C", owner.ID)

	env.rec.entries = nil
	rel, err := env.sampleSvc.AddRelationForTest(ctx, parent.ID, child.ID, "derived_from", "test notes")
	if err != nil {
		t.Fatalf("add relation: %v", err)
	}
	if rel.ParentSampleID != parent.ID {
		t.Errorf("parent id mismatch")
	}
	if rel.ChildSampleID != child.ID {
		t.Errorf("child id mismatch")
	}
	if rel.RelationType != "derived_from" {
		t.Errorf("relation type mismatch: %s", rel.RelationType)
	}
	if !env.rec.hasAction("sample.relation_add") {
		t.Error("expected sample.relation_add audit entry")
	}
}

func TestAddRelation_CrossProject_BadRequest(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-cr@example.com", "Owner CR")
	ws, _ := env.orgSvc.CreateWorkspace(ctx, "WS CR", owner.ID)
	proj1, _ := env.projSvc.CreateProject(ctx, ws.ID, "P1", "", "workspace", owner.ID)
	proj2, _ := env.projSvc.CreateProject(ctx, ws.ID, "P2", "", "workspace", owner.ID)

	s1 := insertSample(t, env, proj1.ID, "S-CR-1", owner.ID)
	s2 := insertSample(t, env, proj2.ID, "S-CR-2", owner.ID)

	_, err := env.sampleSvc.AddRelationForTest(ctx, s1.ID, s2.ID, "derived_from", "")
	if err == nil {
		t.Fatal("expected bad request for cross-project relation")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 400 {
		t.Errorf("expected 400, got %v", err)
	}
	if em.Code != "sample.cross_project_relation" {
		t.Errorf("expected code sample.cross_project_relation, got %s", em.Code)
	}
}

// ─── Lineage tests ─────────────────────────────────────────────────────────────

func TestLineage_ConnectedGraph(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, proj := setupProjectWithOwner(t, env, "lin")

	// Build A → B → C.
	a := insertSample(t, env, proj.ID, "A", owner.ID)
	b := insertSample(t, env, proj.ID, "B", owner.ID)
	c := insertSample(t, env, proj.ID, "C", owner.ID)

	if _, err := env.sampleSvc.AddRelationForTest(ctx, a.ID, b.ID, "derived_from", ""); err != nil {
		t.Fatalf("add A→B: %v", err)
	}
	if _, err := env.sampleSvc.AddRelationForTest(ctx, b.ID, c.ID, "split_from", ""); err != nil {
		t.Fatalf("add B→C: %v", err)
	}

	// Query lineage from B — should return A, B, C with 2 edges.
	graph, err := env.sampleSvc.GetLineageForTest(ctx, b.ID)
	if err != nil {
		t.Fatalf("get lineage: %v", err)
	}
	if len(graph.Nodes) != 3 {
		t.Errorf("expected 3 nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 2 {
		t.Errorf("expected 2 edges, got %d", len(graph.Edges))
	}

	// Verify all three sample IDs appear in nodes.
	nodeIDs := map[uuid.UUID]bool{}
	for _, n := range graph.Nodes {
		nodeIDs[n.ID] = true
	}
	for _, sid := range []uuid.UUID{a.ID, b.ID, c.ID} {
		if !nodeIDs[sid] {
			t.Errorf("node %s missing from lineage graph", sid)
		}
	}
}

func TestLineage_IsolatedSample(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, proj := setupProjectWithOwner(t, env, "iso")
	solo := insertSample(t, env, proj.ID, "SOLO", owner.ID)

	graph, err := env.sampleSvc.GetLineageForTest(ctx, solo.ID)
	if err != nil {
		t.Fatalf("get lineage: %v", err)
	}
	if len(graph.Nodes) != 1 {
		t.Errorf("expected 1 node for isolated sample, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 0 {
		t.Errorf("expected 0 edges for isolated sample, got %d", len(graph.Edges))
	}
}

// ─── Audit tests ───────────────────────────────────────────────────────────────

func TestAudit_CreateRecorded(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner, proj := setupProjectWithOwner(t, env, "audit")
	p := principal(owner)

	env.rec.entries = nil
	if _, err := env.sampleSvc.CreateSampleAuthorized(ctx, p, proj.ID,
		"S-AUDIT", "", "", "other", nil, "active"); err != nil {
		t.Fatalf("create: %v", err)
	}
	if !env.rec.hasAction("sample.create") {
		t.Error("expected sample.create audit entry")
	}
}
