package calendar_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/calendar"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Fakes / helpers ──────────────────────────────────────────────────────────

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
	calSvc  *calendar.Service
	users   *fakeUsers
	rec     *capturingRecorder
}

func nopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

var truncateTables = []string{
	"project_events", "calendar_subscriptions",
	"projects", "project_collaborations", "admin_overrides",
	"workspace_memberships", "workspaces", "users",
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, truncateTables...)

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
	calSvc := calendar.NewService(pool, projSvc, rec, log)

	return &testEnv{
		pool:    pool,
		orgSvc:  orgSvc,
		projSvc: projSvc,
		calSvc:  calSvc,
		users:   fu,
		rec:     rec,
	}
}

func principal(u *auth.User) *platform.Principal {
	return &platform.Principal{UserID: u.ID, Email: u.Email}
}

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

func mustTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}

// ─── E1: Event CRUD tests ─────────────────────────────────────────────────────

func TestCreateEvent_EditorSucceeds(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := setupProject(t, env, owner)

	start := mustTime("2025-06-01T10:00:00Z")
	e, err := env.calSvc.CreateEvent(ctx, proj.ID,
		"meeting", "Team Sync", "Weekly sync",
		start, nil, false, "",
		nil, nil, nil,
		owner.ID,
	)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	if e.ID == uuid.Nil {
		t.Fatal("expected non-nil event ID")
	}
	if e.Title != "Team Sync" {
		t.Errorf("title mismatch: %s", e.Title)
	}
	if e.Kind != "meeting" {
		t.Errorf("kind mismatch: %s", e.Kind)
	}
	if !env.rec.hasAction("event.create") {
		t.Error("expected event.create audit entry")
	}
}

func TestCreateEvent_NonEditorForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner2@example.com", "Owner")
	// viewer is seeded but never added to the workspace, so they have no access.
	viewer := env.users.seed(t, "viewer@example.com", "Viewer")
	proj := setupProject(t, env, owner)

	// Verify that Authorize returns Forbidden for a user not in the workspace.
	// (CreateEvent does not call Authorize — that's the HTTP handler's job —
	// so we call Authorize directly to match the handler's contract.)
	viewerPrincipal := principal(viewer)
	_, _, err := env.projSvc.Authorize(ctx, viewerPrincipal, proj.ID, org.RoleEditor)
	if err == nil {
		t.Fatal("expected error for non-member user on editor check")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.GetStatus() != http.StatusForbidden {
		t.Errorf("expected 403, got %d", em.GetStatus())
	}
}

func TestListEvents_WithFromToFilter(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner3@example.com", "Owner")
	proj := setupProject(t, env, owner)

	s1 := mustTime("2025-06-01T10:00:00Z")
	s2 := mustTime("2025-06-15T10:00:00Z")
	s3 := mustTime("2025-07-01T10:00:00Z")

	for _, ev := range []struct{ title string; start time.Time }{
		{"June 1", s1},
		{"June 15", s2},
		{"July 1", s3},
	} {
		_, err := env.calSvc.CreateEvent(ctx, proj.ID, "", ev.title, "", ev.start, nil, false, "", nil, nil, nil, owner.ID)
		if err != nil {
			t.Fatalf("create event %s: %v", ev.title, err)
		}
	}

	from := mustTime("2025-06-01T00:00:00Z")
	to := mustTime("2025-06-30T23:59:59Z")
	list, err := env.calSvc.ListEvents(ctx, proj.ID, &from, &to)
	if err != nil {
		t.Fatalf("list events: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 events in June, got %d", len(list))
	}

	// List all.
	all, err := env.calSvc.ListEvents(ctx, proj.ID, nil, nil)
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("expected 3 total events, got %d", len(all))
	}
}

func TestGetEvent_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	_, err := env.calSvc.GetEvent(ctx, uuid.New())
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.GetStatus() != http.StatusNotFound {
		t.Errorf("expected 404, got %d", em.GetStatus())
	}
}

func TestPatchEvent_UpdatesFields(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner4@example.com", "Owner")
	proj := setupProject(t, env, owner)

	start := mustTime("2025-06-01T10:00:00Z")
	e, err := env.calSvc.CreateEvent(ctx, proj.ID, "reminder", "Old Title", "old desc",
		start, nil, false, "", nil, nil, nil, owner.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	newTitle := "New Title"
	updated, err := env.calSvc.UpdateEvent(ctx, e.ID,
		nil, &newTitle, nil,
		nil, nil, nil, nil,
		nil, nil, nil,
		owner.ID,
	)
	if err != nil {
		t.Fatalf("update event: %v", err)
	}
	if updated.Title != "New Title" {
		t.Errorf("expected 'New Title', got %q", updated.Title)
	}
	if updated.Description != "old desc" {
		t.Errorf("description should be unchanged, got %q", updated.Description)
	}
	if !env.rec.hasAction("event.update") {
		t.Error("expected event.update audit entry")
	}
}

func TestDeleteEvent_RemovesRow(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner5@example.com", "Owner")
	proj := setupProject(t, env, owner)

	start := mustTime("2025-06-01T10:00:00Z")
	e, err := env.calSvc.CreateEvent(ctx, proj.ID, "", "To Delete", "", start, nil, false, "", nil, nil, nil, owner.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	if err := env.calSvc.DeleteEvent(ctx, e.ID, owner.ID); err != nil {
		t.Fatalf("delete event: %v", err)
	}

	if _, err := env.calSvc.GetEvent(ctx, e.ID); err == nil {
		t.Fatal("expected not-found after delete")
	}

	if !env.rec.hasAction("event.delete") {
		t.Error("expected event.delete audit entry")
	}
}

func TestDeleteEvent_NotFound(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	err := env.calSvc.DeleteEvent(ctx, uuid.New(), uuid.New())
	if err == nil {
		t.Fatal("expected error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T", err)
	}
	if em.GetStatus() != http.StatusNotFound {
		t.Errorf("expected 404, got %d", em.GetStatus())
	}
}

// ─── E2: Subscription tests ───────────────────────────────────────────────────

func TestSubscription_LazyCreate(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	user := env.users.seed(t, "sub1@example.com", "Sub1")

	sub, err := env.calSvc.GetOrCreateSubscription(ctx, user.ID)
	if err != nil {
		t.Fatalf("get or create subscription: %v", err)
	}
	if sub.Token == "" {
		t.Fatal("expected a non-empty token")
	}
	if sub.Scope != "all_visible_projects" {
		t.Errorf("expected scope all_visible_projects, got %s", sub.Scope)
	}

	// Second call should return the same token.
	sub2, err := env.calSvc.GetOrCreateSubscription(ctx, user.ID)
	if err != nil {
		t.Fatalf("second get or create: %v", err)
	}
	if sub.Token != sub2.Token {
		t.Errorf("expected same token on second call: %s vs %s", sub.Token, sub2.Token)
	}
}

func TestSubscription_RotateChangesToken(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	user := env.users.seed(t, "sub2@example.com", "Sub2")

	sub, err := env.calSvc.GetOrCreateSubscription(ctx, user.ID)
	if err != nil {
		t.Fatalf("get or create: %v", err)
	}
	oldToken := sub.Token

	sub2, err := env.calSvc.RotateToken(ctx, user.ID)
	if err != nil {
		t.Fatalf("rotate token: %v", err)
	}
	if sub2.Token == oldToken {
		t.Error("expected a different token after rotation")
	}
	if !env.rec.hasAction("calendar.rotate") {
		t.Error("expected calendar.rotate audit entry")
	}
}

// ─── E2: ICS handler tests ────────────────────────────────────────────────────

// buildICSRouter mounts the ICSHandler on a chi router matching the contract.
func buildICSRouter(svc *calendar.Service) http.Handler {
	r := chi.NewRouter()
	r.Get("/v1/cal/{user_id}/{token}", svc.ICSHandler)
	return r
}

func TestICSHandler_ValidToken_ContainsVEVENT(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "ics1@example.com", "ICS1")
	proj := setupProject(t, env, owner)

	start := mustTime("2025-06-01T10:00:00Z")
	_, err := env.calSvc.CreateEvent(ctx, proj.ID, "meeting", "ICS Meeting", "desc",
		start, nil, false, "", nil, nil, nil, owner.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	sub, err := env.calSvc.GetOrCreateSubscription(ctx, owner.ID)
	if err != nil {
		t.Fatalf("get subscription: %v", err)
	}

	router := buildICSRouter(env.calSvc)
	url := "/v1/cal/" + owner.ID.String() + "/" + sub.Token + ".ics"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	body := w.Body.String()
	if !strings.Contains(body, "BEGIN:VCALENDAR") {
		t.Error("expected BEGIN:VCALENDAR in body")
	}
	if !strings.Contains(body, "BEGIN:VEVENT") {
		t.Error("expected BEGIN:VEVENT in body")
	}
	if !strings.Contains(body, "ICS Meeting") {
		t.Error("expected event title in body")
	}
	if !strings.Contains(body, "END:VCALENDAR") {
		t.Error("expected END:VCALENDAR in body")
	}
}

func TestICSHandler_WrongToken_Returns404(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "ics2@example.com", "ICS2")
	_, err := env.calSvc.GetOrCreateSubscription(ctx, owner.ID)
	if err != nil {
		t.Fatalf("get subscription: %v", err)
	}

	router := buildICSRouter(env.calSvc)
	url := "/v1/cal/" + owner.ID.String() + "/wrongtoken.ics"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestICSHandler_RevokedSubscription_Returns404(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "ics3@example.com", "ICS3")
	sub, err := env.calSvc.GetOrCreateSubscription(ctx, owner.ID)
	if err != nil {
		t.Fatalf("get subscription: %v", err)
	}

	// Manually revoke by setting revoked_at.
	_, err = env.pool.Exec(ctx,
		`UPDATE calendar_subscriptions SET revoked_at = now() WHERE user_id = $1`,
		owner.ID,
	)
	if err != nil {
		t.Fatalf("revoke subscription: %v", err)
	}

	router := buildICSRouter(env.calSvc)
	url := "/v1/cal/" + owner.ID.String() + "/" + sub.Token + ".ics"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for revoked subscription, got %d", w.Code)
	}
}

func TestICSHandler_UnknownUser_Returns404(t *testing.T) {
	env := newTestEnv(t)

	router := buildICSRouter(env.calSvc)
	url := "/v1/cal/" + uuid.New().String() + "/sometoken.ics"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestICSHandler_InvalidUserID_Returns404(t *testing.T) {
	env := newTestEnv(t)

	router := buildICSRouter(env.calSvc)
	url := "/v1/cal/not-a-uuid/sometoken.ics"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for invalid user ID, got %d", w.Code)
	}
}

func TestICSHandler_EmptyCalendar_StillValid(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "ics4@example.com", "ICS4")
	// No project, no events.
	sub, err := env.calSvc.GetOrCreateSubscription(ctx, owner.ID)
	if err != nil {
		t.Fatalf("get subscription: %v", err)
	}

	router := buildICSRouter(env.calSvc)
	url := "/v1/cal/" + owner.ID.String() + "/" + sub.Token + ".ics"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "BEGIN:VCALENDAR") {
		t.Error("expected BEGIN:VCALENDAR even with no events")
	}
}
