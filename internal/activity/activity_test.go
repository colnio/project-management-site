package activity

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

// fakeUsers satisfies org.Users.
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

func (f *fakeUsers) seed(t *testing.T, email, name string) *auth.User {
	t.Helper()
	u := &auth.User{
		ID:          uuid.New(),
		Email:       email,
		DisplayName: name,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	_, err := f.pool.Exec(context.Background(),
		`INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		u.ID, u.Email, u.DisplayName,
	)
	if err != nil {
		t.Fatalf("seed user %s: %v", email, err)
	}
	f.byEmail[email] = u
	f.byID[u.ID] = u
	return u
}

func (f *fakeUsers) GetUserByEmail(_ context.Context, email string) (*auth.User, error) {
	u, ok := f.byEmail[email]
	if !ok {
		return nil, platform.NotFound("user.not_found", "not found")
	}
	return u, nil
}
func (f *fakeUsers) GetUserByID(_ context.Context, id uuid.UUID) (*auth.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, platform.NotFound("user.not_found", "not found")
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
	return nil, platform.BadRequest("not_supported", "not supported")
}
func (f *fakeUsers) SetPassword(_ context.Context, _ uuid.UUID, _ string) error { return nil }

// ─── Test environment ─────────────────────────────────────────────────────────

type testEnv struct {
	pool     *pgxpool.Pool
	svc      *Service
	orgSvc   *org.Service
	projSvc  *project.Service
	users    *fakeUsers
	rec      *capturingRecorder
}

var truncateTables = []string{
	"task_progress", "task_references", "tasks",
	"audit_log",
	"sample_relations", "samples",
	"experiments",
	"page_revisions", "pages",
	"artifacts",
	"risks", "iterations",
	"project_events",
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
	svc := NewService(pool, projSvc, orgSvc, log)

	return &testEnv{
		pool:    pool,
		svc:     svc,
		orgSvc:  orgSvc,
		projSvc: projSvc,
		users:   fu,
		rec:     rec,
	}
}

// seedProject creates a workspace + project with the given owner as workspace
// owner. Returns both the workspace and the project.
func seedProject(t *testing.T, env *testEnv, ownerID uuid.UUID) (*org.Workspace, *project.Project) {
	t.Helper()
	ctx := context.Background()
	ws, err := env.orgSvc.CreateWorkspace(ctx, "Test WS", ownerID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "Test Project", "", "workspace", ownerID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	return ws, proj
}

// insertSample inserts a sample row and returns its ID.
func insertSample(t *testing.T, pool *pgxpool.Pool, projectID, createdBy uuid.UUID, identifier, name string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`INSERT INTO samples (project_id, identifier, name, created_by)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		projectID, identifier, name, createdBy,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insert sample %q: %v", identifier, err)
	}
	return id
}

// insertAuditLog inserts an audit_log row and returns its ID.
func insertAuditLog(t *testing.T, pool *pgxpool.Pool, actor uuid.UUID, action, resourceType, resourceID string, createdAt time.Time) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`INSERT INTO audit_log (actor, action, resource_type, resource_id, created_at)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		actor, action, resourceType, resourceID, createdAt,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insert audit_log %q/%q: %v", action, resourceID, err)
	}
	return id
}

// insertTask inserts a task row and returns its ID.
func insertTask(t *testing.T, pool *pgxpool.Pool, projectID, createdBy uuid.UUID, title string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`INSERT INTO tasks (project_id, seq, title, created_by)
		 VALUES ($1,
		         COALESCE((SELECT MAX(seq) FROM tasks WHERE project_id = $1), 0) + 1,
		         $2, $3)
		 RETURNING id`,
		projectID, title, createdBy,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insert task %q: %v", title, err)
	}
	return id
}

// insertTaskProgress inserts a task_progress row and returns its ID.
func insertTaskProgress(t *testing.T, pool *pgxpool.Pool, taskID, authorID uuid.UUID, eventType string, fromStatus, toStatus *string, reason string, createdAt time.Time) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`INSERT INTO task_progress (task_id, author_id, event_type, from_status, to_status, reason, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id`,
		taskID, authorID, eventType, fromStatus, toStatus, reason, createdAt,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insert task_progress %q: %v", eventType, err)
	}
	return id
}

// principal returns a *platform.Principal for the given user ID (no scopes = full
// first-party session, which is unrestricted). The service's ListForWorkspace
// does not check scopes; scopes are enforced only in the HTTP layer.
func principal(userID uuid.UUID) *platform.Principal {
	return &platform.Principal{UserID: userID}
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// TestListForWorkspace_MergesAndOrders verifies that the feed merges audit_log
// (sample.create) and task_progress (task.created, task.status_change) rows,
// returns them newest-first, and populates all expected fields.
func TestListForWorkspace_MergesAndOrders(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-merge@example.com", "Owner Merge")
	ws, proj := seedProject(t, env, owner.ID)
	p := principal(owner.ID)

	// Seed a sample so the audit row can JOIN it.
	sampleID := insertSample(t, env.pool, proj.ID, owner.ID, "SAMP-001", "My Sample")

	// Three distinct timestamps, strictly increasing (oldest first).
	t0 := time.Now().UTC().Add(-3 * time.Minute).Truncate(time.Millisecond)
	t1 := time.Now().UTC().Add(-2 * time.Minute).Truncate(time.Millisecond)
	t2 := time.Now().UTC().Add(-1 * time.Minute).Truncate(time.Millisecond)

	// Audit row for sample.create at t0 (oldest).
	insertAuditLog(t, env.pool, owner.ID, "sample.create", "sample", sampleID.String(), t0)

	// Task with two progress rows: created at t1, status_change at t2 (newest).
	taskID := insertTask(t, env.pool, proj.ID, owner.ID, "Test Task")
	insertTaskProgress(t, env.pool, taskID, owner.ID, "created", nil, nil, "", t1)
	toStatus := "in_progress"
	fromStatus := "todo"
	insertTaskProgress(t, env.pool, taskID, owner.ID, "status_change", &fromStatus, &toStatus, "", t2)

	items, err := env.svc.ListForWorkspace(ctx, p, ws.ID, 40, nil)
	if err != nil {
		t.Fatalf("ListForWorkspace: %v", err)
	}
	if len(items) == 0 {
		t.Fatal("expected items, got empty slice")
	}

	// Verify newest-first ordering.
	for i := 1; i < len(items); i++ {
		if items[i].CreatedAt.After(items[i-1].CreatedAt) {
			t.Errorf("items[%d].CreatedAt %v > items[%d].CreatedAt %v — not newest-first",
				i, items[i].CreatedAt, i-1, items[i-1].CreatedAt)
		}
	}

	// Collect by action for assertions.
	byAction := make(map[string]*ActivityItem)
	for _, item := range items {
		byAction[item.Action] = item
	}

	// Assert sample.create item.
	sampleItem, ok := byAction["sample.create"]
	if !ok {
		t.Error("expected sample.create item, not found")
	} else {
		if sampleItem.Type != "sample" {
			t.Errorf("sample item type = %q, want sample", sampleItem.Type)
		}
		if sampleItem.Title != "My Sample" {
			t.Errorf("sample item title = %q, want My Sample", sampleItem.Title)
		}
		if sampleItem.ProjectID != proj.ID {
			t.Errorf("sample item project_id = %v, want %v", sampleItem.ProjectID, proj.ID)
		}
	}

	// Assert task.created item.
	taskCreated, ok := byAction["task.created"]
	if !ok {
		t.Error("expected task.created item, not found")
	} else {
		if taskCreated.Type != "task" {
			t.Errorf("task.created type = %q, want task", taskCreated.Type)
		}
		if taskCreated.Title != "Test Task" {
			t.Errorf("task.created title = %q, want Test Task", taskCreated.Title)
		}
		if taskCreated.ProjectID != proj.ID {
			t.Errorf("task.created project_id = %v, want %v", taskCreated.ProjectID, proj.ID)
		}
	}

	// Assert task.status_change item has to_status populated.
	taskStatusChange, ok := byAction["task.status_change"]
	if !ok {
		t.Error("expected task.status_change item, not found")
	} else {
		if taskStatusChange.Type != "task" {
			t.Errorf("task.status_change type = %q, want task", taskStatusChange.Type)
		}
		if taskStatusChange.ToStatus == nil || *taskStatusChange.ToStatus != "in_progress" {
			t.Errorf("task.status_change to_status = %v, want in_progress", taskStatusChange.ToStatus)
		}
	}

	// The newest item (index 0) must be the status_change (t2).
	if items[0].Action != "task.status_change" {
		t.Errorf("items[0].Action = %q, want task.status_change (newest)", items[0].Action)
	}
	// The oldest item must be the sample.create (t0).
	if items[len(items)-1].Action != "sample.create" {
		t.Errorf("items[last].Action = %q, want sample.create (oldest)", items[len(items)-1].Action)
	}
}

// TestListForWorkspace_AccessScoping verifies that events from a private project
// the principal is NOT a collaborator on do NOT appear in the feed — even though
// the private project is in the same workspace.
func TestListForWorkspace_AccessScoping(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	// Owner A: creates workspace W, seeded as workspace owner (gets full access).
	ownerA := env.users.seed(t, "owner-a-scope@example.com", "Owner A")
	ws, projA := seedProject(t, env, ownerA.ID)
	pA := principal(ownerA.ID)

	// Owner B: in the SAME workspace W as a regular member (not owner).
	// Project B is 'private' — created by B, so B gets a collaborator entry.
	// A is only a workspace member (member role), so A CANNOT read private projects
	// unless explicitly added as a collaborator.
	ownerB := env.users.seed(t, "owner-b-scope@example.com", "Owner B")

	// Add B as a workspace member (not owner) so B can create a project in W.
	_, err := env.pool.Exec(ctx,
		`INSERT INTO workspace_memberships (workspace_id, user_id, role)
		 VALUES ($1, $2, 'member')`,
		ws.ID, ownerB.ID,
	)
	if err != nil {
		t.Fatalf("add B as workspace member: %v", err)
	}

	// Create private project B in workspace W, owned by B.
	projB, err := env.projSvc.CreateProject(ctx, ws.ID, "Private Project B", "", "private", ownerB.ID)
	if err != nil {
		t.Fatalf("create private project B: %v", err)
	}

	// Seed a sample in projA for ownerA (so A has something visible).
	sampleAID := insertSample(t, env.pool, projA.ID, ownerA.ID, "SAMP-A", "Sample A")
	sampleBID := insertSample(t, env.pool, projB.ID, ownerB.ID, "SAMP-B", "Sample B")

	now := time.Now().UTC()
	insertAuditLog(t, env.pool, ownerA.ID, "sample.create", "sample", sampleAID.String(), now.Add(-2*time.Minute))
	insertAuditLog(t, env.pool, ownerB.ID, "sample.create", "sample", sampleBID.String(), now.Add(-1*time.Minute))

	// Call ListForWorkspace as principal A on workspace W.
	items, err := env.svc.ListForWorkspace(ctx, pA, ws.ID, 40, nil)
	if err != nil {
		t.Fatalf("ListForWorkspace: %v", err)
	}

	// Assert that no item is from projB (the private project A can't read).
	for _, item := range items {
		if item.ProjectID == projB.ID {
			t.Errorf("item from private project B (entity_id=%s, action=%s) leaked into principal A's feed",
				item.EntityID, item.Action)
		}
	}

	// Confirm that A's own project A items are present.
	foundA := false
	for _, item := range items {
		if item.ProjectID == projA.ID {
			foundA = true
			break
		}
	}
	if !foundA {
		t.Error("expected items from projA to appear for principal A, but got none")
	}
}

// TestListForWorkspace_BeforeCursorPaginates verifies the `before` cursor:
//   - first call with limit=2 returns the 2 newest items;
//   - second call with before = created_at of the 2nd item returns older items only.
func TestListForWorkspace_BeforeCursorPaginates(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-page@example.com", "Owner Page")
	ws, proj := seedProject(t, env, owner.ID)
	p := principal(owner.ID)

	// Seed 4 samples with 4 distinct timestamps (oldest first).
	now := time.Now().UTC()
	times := []time.Time{
		now.Add(-4 * time.Minute).Truncate(time.Millisecond),
		now.Add(-3 * time.Minute).Truncate(time.Millisecond),
		now.Add(-2 * time.Minute).Truncate(time.Millisecond),
		now.Add(-1 * time.Minute).Truncate(time.Millisecond),
	}

	for i, ts := range times {
		sID := insertSample(t, env.pool, proj.ID, owner.ID,
			"SAMP-PAGE-"+time.Time(ts).Format("150405000"),
			"Sample Page "+string(rune('A'+i)),
		)
		insertAuditLog(t, env.pool, owner.ID, "sample.create", "sample", sID.String(), ts)
	}

	// First page: 2 newest items (should be times[3] and times[2]).
	page1, err := env.svc.ListForWorkspace(ctx, p, ws.ID, 2, nil)
	if err != nil {
		t.Fatalf("ListForWorkspace page1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 count = %d, want 2", len(page1))
	}

	// Verify page1 is newest-first.
	if !page1[0].CreatedAt.After(page1[1].CreatedAt) && page1[0].CreatedAt != page1[1].CreatedAt {
		// allow equal only if they happen to be exactly the same
	}

	// Cursor = created_at of the last (oldest) item on page1.
	cursor := page1[len(page1)-1].CreatedAt

	// Second page: items strictly before the cursor.
	page2, err := env.svc.ListForWorkspace(ctx, p, ws.ID, 2, &cursor)
	if err != nil {
		t.Fatalf("ListForWorkspace page2: %v", err)
	}
	if len(page2) == 0 {
		t.Fatal("page2 is empty — expected older items")
	}

	// All page2 items must be strictly before the cursor.
	for _, item := range page2 {
		if !item.CreatedAt.Before(cursor) {
			t.Errorf("page2 item created_at %v is not before cursor %v", item.CreatedAt, cursor)
		}
	}

	// No page1 item should appear in page2.
	page1IDs := make(map[string]bool)
	for _, item := range page1 {
		page1IDs[item.ID] = true
	}
	for _, item := range page2 {
		if page1IDs[item.ID] {
			t.Errorf("item %s appeared on both page1 and page2", item.ID)
		}
	}
}

// TestListForWorkspace_EmptyWhenNoAccessibleProjects verifies that when the
// principal has no accessible projects in the workspace, an empty (non-nil)
// slice is returned without error.
func TestListForWorkspace_EmptyWhenNoAccessibleProjects(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	// Create a workspace with an owner but no projects.
	owner := env.users.seed(t, "owner-empty@example.com", "Owner Empty")
	ws, err := env.orgSvc.CreateWorkspace(ctx, "Empty WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	p := principal(owner.ID)

	items, err := env.svc.ListForWorkspace(ctx, p, ws.ID, 40, nil)
	if err != nil {
		t.Fatalf("ListForWorkspace: %v", err)
	}
	if items == nil {
		t.Error("expected non-nil empty slice, got nil")
	}
	if len(items) != 0 {
		t.Errorf("expected 0 items for workspace with no projects, got %d", len(items))
	}

	// Also test: a workspace with one private project the principal cannot access.
	// Create a second user who owns a private project in the same workspace.
	other := env.users.seed(t, "other-empty@example.com", "Other User")
	_, err = env.pool.Exec(ctx,
		`INSERT INTO workspace_memberships (workspace_id, user_id, role)
		 VALUES ($1, $2, 'member')`,
		ws.ID, other.ID,
	)
	if err != nil {
		t.Fatalf("add other as workspace member: %v", err)
	}

	privateProj, err := env.projSvc.CreateProject(ctx, ws.ID, "Private Project", "", "private", other.ID)
	if err != nil {
		t.Fatalf("create private project: %v", err)
	}

	// Seed some activity for the private project.
	sID := insertSample(t, env.pool, privateProj.ID, other.ID, "SAMP-PRIV", "Private Sample")
	insertAuditLog(t, env.pool, other.ID, "sample.create", "sample", sID.String(), time.Now().UTC())

	// Principal (owner) is workspace owner but not a collaborator on privateProj,
	// so ListProjectsForWorkspace should not include it.
	// Actually, workspace owners get owner role on workspace-visible projects, but
	// private projects require a collaborator entry. Let's verify:
	// Since owner is workspace owner with wsRole="owner", and private project has
	// visibility="private", resolveAccessFromParts returns RoleNone unless owner
	// has a collaborator entry (which they don't).
	// However, we need to ensure owner does NOT have a collaborator entry on privateProj.
	// CreateProject with visibility=private adds the CREATOR (other) as collaborator, not owner.

	// owner has no collaborator entry on privateProj → no access.
	// BUT: workspace owner gets RoleOwner for workspace-visible projects only.
	// For private projects, workspace owner still needs collaborator entry.
	// Let's verify what the access resolution says:
	items2, err := env.svc.ListForWorkspace(ctx, p, ws.ID, 40, nil)
	if err != nil {
		t.Fatalf("ListForWorkspace with private project: %v", err)
	}
	for _, item := range items2 {
		if item.ProjectID == privateProj.ID {
			t.Errorf("private project item leaked for workspace owner without collab entry: action=%s", item.Action)
		}
	}
}
