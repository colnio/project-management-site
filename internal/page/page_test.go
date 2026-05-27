package page_test

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
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/page"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

func nopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

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

// testEnv holds all services needed by page tests.
type testEnv struct {
	pool    *pgxpool.Pool
	pageSvc *page.Service
	projSvc *project.Service
	orgSvc  *org.Service
	rec     *capturingRecorder
	ctx     context.Context
}

// seed helpers insert rows directly via SQL.

func seedUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		id, id.String()+"@test.com", "Test User",
	)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return id
}

func seedWorkspace(t *testing.T, pool *pgxpool.Pool, ownerID uuid.UUID) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO workspaces (id, name, slug, created_by) VALUES ($1, $2, $3, $4)`,
		id, "Test WS "+id.String()[:8], "ws-"+id.String()[:8], ownerID,
	)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	return id
}

func seedMembership(t *testing.T, pool *pgxpool.Pool, wsID, userID uuid.UUID, role string) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT DO NOTHING`,
		wsID, userID, role,
	)
	if err != nil {
		t.Fatalf("seed membership: %v", err)
	}
}

func seedProject(t *testing.T, pool *pgxpool.Pool, wsID, creatorID uuid.UUID, visibility string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO projects (id, workspace_id, name, visibility, created_by)
		 VALUES ($1, $2, $3, $4, $5)`,
		id, wsID, "Proj "+id.String()[:8], visibility, creatorID,
	)
	if err != nil {
		t.Fatalf("seed project: %v", err)
	}
	return id
}

func principal(userID uuid.UUID) *platform.Principal {
	return &platform.Principal{UserID: userID}
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"page_presence", "page_revisions", "page_blobs", "pages",
		"projects", "project_collaborations",
		"workspace_memberships", "workspaces", "users",
	)

	rec := &capturingRecorder{}
	log := nopLogger()

	// Minimal org service (no email, no invite) — pass audit.Nop and nil users
	// since we don't test org features directly.
	orgSvc := org.NewService(pool, nil, audit.Nop{}, nil, log)
	projSvc := project.NewService(pool, orgSvc, nil, audit.Nop{}, log)
	pageSvc := page.NewService(pool, projSvc, rec, log)

	return &testEnv{
		pool:    pool,
		pageSvc: pageSvc,
		projSvc: projSvc,
		orgSvc:  orgSvc,
		rec:     rec,
		ctx:     context.Background(),
	}
}

// setupProject creates a user, workspace, membership, and project. Returns the
// userID and projectID.
func setupProject(t *testing.T, env *testEnv) (userID, projectID uuid.UUID) {
	t.Helper()
	userID = seedUser(t, env.pool)
	wsID := seedWorkspace(t, env.pool, userID)
	seedMembership(t, env.pool, wsID, userID, "owner")
	projectID = seedProject(t, env.pool, wsID, userID, "workspace")
	return
}

// ─── Service-level tests ──────────────────────────────────────────────────────

func TestGetPage_NotFound(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.pageSvc.GetPage(env.ctx, uuid.New())
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404, got %v", err)
	}
}

// ─── HTTP-layer tests via service calls ───────────────────────────────────────

// createPageDirect calls the service's internal createPage via a helper that
// mimics what the HTTP handler does: auth via projects.Authorize and then
// createPage.
func createPageHelper(t *testing.T, env *testEnv, projectID, userID uuid.UUID, blocks json.RawMessage) (*page.Page, *page.Revision) {
	t.Helper()
	p := principal(userID)
	pg, rev, _, err := page.ExportCreatePage(env.pageSvc, env.ctx, projectID, "project", projectID, blocks, p.UserID)
	if err != nil {
		t.Fatalf("create page: %v", err)
	}
	return pg, rev
}

func TestCreatePage_HappyPath(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks := json.RawMessage(`[{"type":"paragraph","text":"Hello world"}]`)
	pg, rev := createPageHelper(t, env, projectID, userID, blocks)

	if pg.ID == uuid.Nil {
		t.Fatal("expected non-nil page ID")
	}
	if pg.CurrentRevisionID == nil {
		t.Fatal("expected current_revision_id to be set")
	}
	if *pg.CurrentRevisionID != rev.ID {
		t.Errorf("current_revision_id mismatch: page=%v rev=%v", pg.CurrentRevisionID, rev.ID)
	}
	if rev.Source != "human" {
		t.Errorf("expected source=human, got %s", rev.Source)
	}
	if rev.Status != "current" {
		t.Errorf("expected status=current, got %s", rev.Status)
	}

	// Verify audit entry.
	if !env.rec.hasAction("page.create") {
		t.Error("expected page.create audit entry")
	}

	// GET page returns blocks.
	loaded, err := env.pageSvc.GetPage(env.ctx, pg.ID)
	if err != nil {
		t.Fatalf("get page: %v", err)
	}
	if loaded.CurrentRevisionID == nil || *loaded.CurrentRevisionID != rev.ID {
		t.Error("loaded page current_revision_id mismatch")
	}
}

func TestCreatePage_BlobDeduplication(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks := json.RawMessage(`[{"text":"Same content","type":"p"}]`)

	// Create two pages with identical blocks.
	createPageHelper(t, env, projectID, userID, blocks)
	createPageHelper(t, env, projectID, userID, blocks)

	// There should be exactly 1 blob row.
	var count int
	err := env.pool.QueryRow(env.ctx, `SELECT COUNT(*) FROM page_blobs`).Scan(&count)
	if err != nil {
		t.Fatalf("count blobs: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 blob row, got %d", count)
	}
}

func TestUpdatePage_IfMatchRoundtrip(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks1)

	// Correct If-Match → should succeed.
	etag := platform.FormatETag(rev1.ID.String())
	blocks2 := json.RawMessage(`[{"type":"p","text":"v2"}]`)
	rev2, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocks2, "human", false, userID, etag)
	if err != nil {
		t.Fatalf("update page: %v", err)
	}
	if rev2.Status != "current" {
		t.Errorf("expected new revision status=current, got %s", rev2.Status)
	}

	// Check old revision is superseded.
	var oldStatus string
	err = env.pool.QueryRow(env.ctx,
		`SELECT status FROM page_revisions WHERE id = $1`, rev1.ID,
	).Scan(&oldStatus)
	if err != nil {
		t.Fatalf("query old rev: %v", err)
	}
	if oldStatus != "superseded" {
		t.Errorf("expected old revision superseded, got %s", oldStatus)
	}

	// Audit entry.
	if !env.rec.hasAction("page.update") {
		t.Error("expected page.update audit entry")
	}
}

func TestUpdatePage_StalIfMatch_Returns412(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, _ := createPageHelper(t, env, projectID, userID, blocks1)

	// Stale ETag.
	staleEtag := platform.FormatETag(uuid.New().String())
	blocks2 := json.RawMessage(`[{"type":"p","text":"v2"}]`)
	_, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocks2, "human", false, userID, staleEtag)
	if err == nil {
		t.Fatal("expected 412 error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 412 {
		t.Errorf("expected 412, got %v", err)
	}
}

func TestUpdatePage_MissingIfMatch_Returns412(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, _ := createPageHelper(t, env, projectID, userID, blocks1)

	blocks2 := json.RawMessage(`[{"type":"p","text":"v2"}]`)
	_, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocks2, "human", false, userID, "")
	if err == nil {
		t.Fatal("expected 412 error for missing If-Match")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 412 {
		t.Errorf("expected 412, got %v", err)
	}
}

func TestRevisionsList_ShowsMultiple(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks1)

	etag1 := platform.FormatETag(rev1.ID.String())
	blocks2 := json.RawMessage(`[{"type":"p","text":"v2"}]`)
	_, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocks2, "human", false, userID, etag1)
	if err != nil {
		t.Fatalf("update: %v", err)
	}

	// List revisions.
	revs, err := page.ExportListRevisions(env.pageSvc, env.ctx, pg.ID)
	if err != nil {
		t.Fatalf("list revisions: %v", err)
	}
	if len(revs) < 2 {
		t.Errorf("expected ≥2 revisions, got %d", len(revs))
	}
}

func TestRestore_NonDestructive(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"original"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks1)

	etag1 := platform.FormatETag(rev1.ID.String())
	blocks2 := json.RawMessage(`[{"type":"p","text":"updated"}]`)
	rev2, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocks2, "human", false, userID, etag1)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	_ = rev2

	// Restore to rev1.
	pg2, restoreRev, err := page.ExportRestore(env.pageSvc, env.ctx, pg.ID, rev1.ID, userID)
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if restoreRev.Source != "restore" {
		t.Errorf("expected source=restore, got %s", restoreRev.Source)
	}
	if restoreRev.Status != "current" {
		t.Errorf("expected status=current, got %s", restoreRev.Status)
	}
	if pg2.CurrentRevisionID == nil || *pg2.CurrentRevisionID != restoreRev.ID {
		t.Error("page current_revision_id should point to restore revision")
	}

	// Old revisions still present.
	revs, err := page.ExportListRevisions(env.pageSvc, env.ctx, pg.ID)
	if err != nil {
		t.Fatalf("list revisions: %v", err)
	}
	if len(revs) < 3 {
		t.Errorf("expected ≥3 revisions (original, update, restore), got %d", len(revs))
	}

	// Audit recorded.
	if !env.rec.hasAction("page.restore") {
		t.Error("expected page.restore audit entry")
	}
}

func TestCandidate_ApproveFlow(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks1)
	originalCurrentID := rev1.ID

	// Create a candidate revision.
	etag1 := platform.FormatETag(rev1.ID.String())
	blocksC := json.RawMessage(`[{"type":"p","text":"candidate"}]`)
	candRev, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocksC, "human", true, userID, etag1)
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}
	if candRev.Status != "candidate" {
		t.Errorf("expected status=candidate, got %s", candRev.Status)
	}

	// Page's current should still be rev1.
	pg, err = env.pageSvc.GetPage(env.ctx, pg.ID)
	if err != nil {
		t.Fatalf("get page: %v", err)
	}
	if pg.CurrentRevisionID == nil || *pg.CurrentRevisionID != originalCurrentID {
		t.Error("page current_revision_id should not change for candidate")
	}

	// Approve the candidate.
	pg, approvedRev, err := page.ExportApproveCandidate(env.pageSvc, env.ctx, pg.ID, candRev.ID, userID)
	if err != nil {
		t.Fatalf("approve candidate: %v", err)
	}
	if approvedRev.Status != "current" {
		t.Errorf("expected approved revision status=current, got %s", approvedRev.Status)
	}
	if pg.CurrentRevisionID == nil || *pg.CurrentRevisionID != candRev.ID {
		t.Error("page should now point to approved candidate")
	}

	// Old current (rev1) should be superseded.
	var oldStatus string
	_ = env.pool.QueryRow(env.ctx,
		`SELECT status FROM page_revisions WHERE id=$1`, originalCurrentID,
	).Scan(&oldStatus)
	if oldStatus != "superseded" {
		t.Errorf("expected old current=superseded, got %s", oldStatus)
	}
}

func TestCandidate_RejectFlow(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks1)

	etag1 := platform.FormatETag(rev1.ID.String())
	blocksC := json.RawMessage(`[{"type":"p","text":"bad candidate"}]`)
	candRev, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocksC, "human", true, userID, etag1)
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}

	rejectedRev, err := page.ExportRejectCandidate(env.pageSvc, env.ctx, pg.ID, candRev.ID, userID)
	if err != nil {
		t.Fatalf("reject candidate: %v", err)
	}
	if rejectedRev.Status != "rejected" {
		t.Errorf("expected status=rejected, got %s", rejectedRev.Status)
	}

	// Page's current should still be rev1.
	pg, err = env.pageSvc.GetPage(env.ctx, pg.ID)
	if err != nil {
		t.Fatalf("get page: %v", err)
	}
	if pg.CurrentRevisionID == nil || *pg.CurrentRevisionID != rev1.ID {
		t.Error("page current should still be rev1 after reject")
	}
}

func TestDiff_ReturnsLines(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"line one"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks1)

	etag1 := platform.FormatETag(rev1.ID.String())
	blocks2 := json.RawMessage(`[{"type":"p","text":"line two"}]`)
	rev2, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocks2, "human", false, userID, etag1)
	if err != nil {
		t.Fatalf("update: %v", err)
	}

	lines, err := page.ExportDiff(env.pageSvc, env.ctx, rev1.ID, rev2.ID)
	if err != nil {
		t.Fatalf("diff: %v", err)
	}
	// Should have at least a "+" and "-" line.
	var hasMinus, hasPlus bool
	for _, l := range lines {
		if l.Op == "-" {
			hasMinus = true
		}
		if l.Op == "+" {
			hasPlus = true
		}
	}
	if !hasMinus || !hasPlus {
		t.Errorf("expected +/- lines in diff, got %+v", lines)
	}
}

func TestPresence_HeartbeatAndList(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks := json.RawMessage(`[{"type":"p","text":"hi"}]`)
	pg, _ := createPageHelper(t, env, projectID, userID, blocks)

	// Heartbeat.
	err := page.ExportPresenceHeartbeat(env.pageSvc, env.ctx, pg.ID, userID, "client-1")
	if err != nil {
		t.Fatalf("heartbeat: %v", err)
	}

	// List — should see the user.
	entries, err := page.ExportPresenceList(env.pageSvc, env.ctx, pg.ID)
	if err != nil {
		t.Fatalf("presence list: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected at least one presence entry")
	}
	found := false
	for _, e := range entries {
		if e.UserID == userID {
			found = true
		}
	}
	if !found {
		t.Error("expected to find the user in presence list")
	}
}

func TestNonEditor_CannotUpdatePage(t *testing.T) {
	env := newTestEnv(t)
	ownerID, projectID := setupProject(t, env)

	// Seed a viewer user.
	viewerID := seedUser(t, env.pool)
	// Add as collaborator with viewer role.
	_, err := env.pool.Exec(env.ctx,
		`INSERT INTO project_collaborations (project_id, user_id, role) VALUES ($1, $2, 'viewer')`,
		projectID, viewerID,
	)
	if err != nil {
		t.Fatalf("add viewer collab: %v", err)
	}

	blocks := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, ownerID, blocks)

	// Viewer tries to update — should get 403.
	etag := platform.FormatETag(rev1.ID.String())
	blocks2 := json.RawMessage(`[{"type":"p","text":"v2"}]`)
	// updatePage does internal auth check via authPage with RoleEditor.
	_, _, err = page.ExportUpdatePageWithPrincipal(env.pageSvc, env.ctx, pg, blocks2, "human", false,
		&platform.Principal{UserID: viewerID}, etag)
	if err == nil {
		t.Fatal("expected forbidden error for viewer")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
}

func TestGCAutoSaves_KeepsNewest20(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks := json.RawMessage(`[{"type":"p","text":"start"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks)

	// Create 25 auto_save revisions.
	etag := platform.FormatETag(rev1.ID.String())
	var lastRev *page.Revision
	lastRev = rev1
	for i := 0; i < 25; i++ {
		b := json.RawMessage(`[{"type":"p","text":"` + uuid.New().String() + `"}]`)
		rev, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, b, "auto_save", false, userID, etag)
		if err != nil {
			t.Fatalf("auto_save update %d: %v", i, err)
		}
		etag = platform.FormatETag(rev.ID.String())
		lastRev = rev
		// Re-load page.
		pg, err = env.pageSvc.GetPage(env.ctx, pg.ID)
		if err != nil {
			t.Fatalf("get page: %v", err)
		}
	}
	_ = lastRev

	// Now run GC.
	deleted, err := env.pageSvc.GCAutoSaves(env.ctx)
	if err != nil {
		t.Fatalf("gc: %v", err)
	}
	// We had 25 auto_save revisions + the initial human one = 26 total.
	// All 25 auto_saves are keep_with_gc. The current is never deleted (status='current').
	// So 24 are superseded keep_with_gc, of which we keep 20, delete 4.
	// But initial rev1 is human/keep_forever — never deleted.
	// Expected: 25 - 1 (current) = 24 superseded auto_saves; keep 20, delete 4.
	if deleted < 4 {
		t.Errorf("expected at least 4 deleted, got %d", deleted)
	}

	// Verify current revision is still present.
	var curStatus string
	_ = env.pool.QueryRow(env.ctx,
		`SELECT status FROM page_revisions WHERE id = $1`, *pg.CurrentRevisionID,
	).Scan(&curStatus)
	if curStatus != "current" {
		t.Errorf("expected current revision status=current, got %s", curStatus)
	}

	// Auto_save keep_with_gc non-current should be ≤20.
	var gcCount int
	_ = env.pool.QueryRow(env.ctx,
		`SELECT COUNT(*) FROM page_revisions
		 WHERE page_id=$1 AND source='auto_save' AND retention_class='keep_with_gc' AND status!='current'`,
		pg.ID,
	).Scan(&gcCount)
	if gcCount > 20 {
		t.Errorf("expected ≤20 auto_save revisions, got %d", gcCount)
	}
}

func TestGCAutoSaves_NeverDeletesKeepForever(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks := json.RawMessage(`[{"type":"p","text":"keep me"}]`)
	createPageHelper(t, env, projectID, userID, blocks)

	// GC should delete 0 rows (only keep_forever revisions exist).
	deleted, err := env.pageSvc.GCAutoSaves(env.ctx)
	if err != nil {
		t.Fatalf("gc: %v", err)
	}
	if deleted != 0 {
		t.Errorf("expected 0 deleted, got %d", deleted)
	}
}

func TestAutoSave_RetentionClass(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks1)

	etag := platform.FormatETag(rev1.ID.String())
	blocks2 := json.RawMessage(`[{"type":"p","text":"auto"}]`)
	rev2, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocks2, "auto_save", false, userID, etag)
	if err != nil {
		t.Fatalf("auto_save update: %v", err)
	}
	if rev2.RetentionClass != "keep_with_gc" {
		t.Errorf("expected keep_with_gc for auto_save, got %s", rev2.RetentionClass)
	}

	// Human revision should be keep_forever.
	if rev1.RetentionClass != "keep_forever" {
		t.Errorf("expected keep_forever for human, got %s", rev1.RetentionClass)
	}
}

func TestAuditCreate_PageCreate(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks := json.RawMessage(`[{"type":"p","text":"audit test"}]`)
	createPageHelper(t, env, projectID, userID, blocks)

	if !env.rec.hasAction("page.create") {
		t.Error("expected page.create audit entry")
	}
}

func TestAuditUpdate_PageUpdate(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	blocks1 := json.RawMessage(`[{"type":"p","text":"v1"}]`)
	pg, rev1 := createPageHelper(t, env, projectID, userID, blocks1)

	etag := platform.FormatETag(rev1.ID.String())
	blocks2 := json.RawMessage(`[{"type":"p","text":"v2"}]`)
	_, _, err := page.ExportUpdatePage(env.pageSvc, env.ctx, pg, blocks2, "human", false, userID, etag)
	if err != nil {
		t.Fatalf("update: %v", err)
	}

	if !env.rec.hasAction("page.update") {
		t.Error("expected page.update audit entry")
	}
}

// presenceEntryExport mirrors page.presenceEntry for test assertions.
type presenceEntryExport struct {
	UserID        uuid.UUID
	Since         time.Time
	LastHeartbeat time.Time
}

// ─── List pages tests ─────────────────────────────────────────────────────────

func TestDeriveTitle_HeadingLine(t *testing.T) {
	cases := []struct {
		md   string
		want string
	}{
		{"# My Page\nsome body", "My Page"},
		{"## Section", "Section"},
		{"### Deep", "Deep"},
		{"plain text", "plain text"},
		{"  \n\n# Spaced\n", "Spaced"},
		{"", "Untitled"},
		{"   ", "Untitled"},
		{"# ", "Untitled"}, // heading with no text
	}
	for _, tc := range cases {
		got := page.ExportDeriveTitle(tc.md)
		if got != tc.want {
			t.Errorf("deriveTitle(%q) = %q, want %q", tc.md, got, tc.want)
		}
	}
}

func TestListPagesByProject_BasicFiltering(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	// Create a page with parent_type="project".
	blocksA := json.RawMessage(`[{"type":"p","text":"# Alpha Page"}]`)
	pgA, _ := createPageHelper(t, env, projectID, userID, blocksA)
	_ = pgA

	// Create a second page with parent_type="iteration" using a different parent_id.
	iterID := uuid.New()
	_, _, _, err := page.ExportCreatePage(env.pageSvc, env.ctx, projectID, "iteration", iterID,
		json.RawMessage(`[{"type":"p","text":"# Beta Iter"}]`), userID)
	if err != nil {
		t.Fatalf("create iteration page: %v", err)
	}

	// List all pages for the project — expect 2.
	all, err := page.ExportListPagesByProject(env.pageSvc, env.ctx, projectID, "", nil)
	if err != nil {
		t.Fatalf("list all pages: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("expected 2 pages, got %d", len(all))
	}

	// Filter by parent_type="project" — expect 1.
	projPages, err := page.ExportListPagesByProject(env.pageSvc, env.ctx, projectID, "project", nil)
	if err != nil {
		t.Fatalf("list project pages: %v", err)
	}
	if len(projPages) != 1 {
		t.Errorf("expected 1 project page, got %d", len(projPages))
	}

	// Filter by parent_type="iteration" — expect 1.
	iterPages, err := page.ExportListPagesByProject(env.pageSvc, env.ctx, projectID, "iteration", nil)
	if err != nil {
		t.Fatalf("list iteration pages: %v", err)
	}
	if len(iterPages) != 1 {
		t.Errorf("expected 1 iteration page, got %d", len(iterPages))
	}

	// Filter by parent_type and parent_id — should match exactly the iter page.
	byParentID, err := page.ExportListPagesByProject(env.pageSvc, env.ctx, projectID, "iteration", &iterID)
	if err != nil {
		t.Fatalf("list by parent_id: %v", err)
	}
	if len(byParentID) != 1 {
		t.Errorf("expected 1 page by parent_id, got %d", len(byParentID))
	}

	// Unknown project — expect 0.
	none, err := page.ExportListPagesByProject(env.pageSvc, env.ctx, uuid.New(), "", nil)
	if err != nil {
		t.Fatalf("list unknown project: %v", err)
	}
	if len(none) != 0 {
		t.Errorf("expected 0 pages for unknown project, got %d", len(none))
	}
}

func TestListPagesByProject_TitleDerived(t *testing.T) {
	env := newTestEnv(t)
	userID, projectID := setupProject(t, env)

	// The markdown_export is derived from block text; create a page with a heading block.
	blocks := json.RawMessage(`[{"type":"heading","text":"# My Heading"}]`)
	createPageHelper(t, env, projectID, userID, blocks)

	items, err := page.ExportListPagesByProject(env.pageSvc, env.ctx, projectID, "", nil)
	if err != nil {
		t.Fatalf("list pages: %v", err)
	}
	if len(items) == 0 {
		t.Fatal("expected at least one page")
	}
	// Title must be non-empty and not "Untitled" (block text is non-empty).
	if items[0].Title == "" {
		t.Error("expected non-empty title")
	}
}
