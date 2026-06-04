package task

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
	"github.com/colnio/project-management-site/internal/calendar"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/iteration"
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
	pool    *pgxpool.Pool
	taskSvc *Service
	orgSvc  *org.Service
	projSvc *project.Service
	iterSvc *iteration.Service
	calSvc  *calendar.Service
	users   *fakeUsers
	rec     *capturingRecorder
}

var truncateTables = []string{
	"task_progress", "task_references", "tasks",
	"project_events",
	"risks", "iterations",
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
	iterSvc := iteration.NewService(pool, projSvc, rec, log)
	calSvc := calendar.NewService(pool, projSvc, rec, log)
	taskSvc := NewService(pool, projSvc, iterSvc, calSvc, rec, log)

	return &testEnv{
		pool:    pool,
		taskSvc: taskSvc,
		orgSvc:  orgSvc,
		projSvc: projSvc,
		iterSvc: iterSvc,
		calSvc:  calSvc,
		users:   fu,
		rec:     rec,
	}
}

// seedProject creates a workspace + project with owner as the sole member,
// mirroring risk_test.go's approach.
func seedProject(t *testing.T, env *testEnv, ownerID uuid.UUID) *project.Project {
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
	return proj
}

// assertPlatformError checks that err is a *platform.ErrorModel with the given code.
func assertPlatformError(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error with code %q, got nil", code)
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.Code != code {
		t.Errorf("error code = %q, want %q (message: %s)", em.Code, code, em.Message)
	}
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// TestCreateTask_DefaultsAndProgress verifies that createTask sets status="todo",
// seq>=1, and ListProgress has one "created" event.
func TestCreateTask_DefaultsAndProgress(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-create@example.com", "Owner Create")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "My Task", "some description", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	if task.Status != "todo" {
		t.Errorf("status = %q, want %q", task.Status, "todo")
	}
	if task.Seq < 1 {
		t.Errorf("seq = %d, want >= 1", task.Seq)
	}
	if task.Title != "My Task" {
		t.Errorf("title = %q, want %q", task.Title, "My Task")
	}

	progress, err := env.taskSvc.ListProgress(ctx, task.ID)
	if err != nil {
		t.Fatalf("ListProgress: %v", err)
	}
	if len(progress) != 1 {
		t.Fatalf("progress count = %d, want 1", len(progress))
	}
	if progress[0].EventType != "created" {
		t.Errorf("event_type = %q, want %q", progress[0].EventType, "created")
	}
}

// TestMarkDone_BlockedWithoutReferences verifies that MarkDone returns a
// task.references_required error when no references exist, and the task
// remains in_progress.
func TestMarkDone_BlockedWithoutReferences(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-noref@example.com", "Owner NoRef")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "Needs Reference", "", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	estimate := time.Now().Add(24 * time.Hour)
	task, err = env.taskSvc.TakeTask(ctx, task.ID, owner.ID, estimate)
	if err != nil {
		t.Fatalf("TakeTask: %v", err)
	}
	if task.Status != "in_progress" {
		t.Errorf("status after take = %q, want in_progress", task.Status)
	}

	_, err = env.taskSvc.MarkDone(ctx, task.ID, owner.ID)
	assertPlatformError(t, err, "task.references_required")

	// Status must still be in_progress.
	reloaded, err := env.taskSvc.GetTask(ctx, task.ID)
	if err != nil {
		t.Fatalf("GetTask: %v", err)
	}
	if reloaded.Status != "in_progress" {
		t.Errorf("status after failed MarkDone = %q, want in_progress", reloaded.Status)
	}
}

// TestMarkDone_SucceedsWithReference verifies that AddReference + MarkDone
// succeeds: status becomes "done" and FinishedAt is set.
func TestMarkDone_SucceedsWithReference(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-done@example.com", "Owner Done")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "Will Finish", "", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	estimate := time.Now().Add(24 * time.Hour)
	task, err = env.taskSvc.TakeTask(ctx, task.ID, owner.ID, estimate)
	if err != nil {
		t.Fatalf("TakeTask: %v", err)
	}

	sampleID := uuid.New()
	_, err = env.taskSvc.AddReference(ctx, task.ID, "sample", sampleID, owner.ID)
	if err != nil {
		t.Fatalf("AddReference: %v", err)
	}

	done, err := env.taskSvc.MarkDone(ctx, task.ID, owner.ID)
	if err != nil {
		t.Fatalf("MarkDone: %v", err)
	}
	if done.Status != "done" {
		t.Errorf("status = %q, want done", done.Status)
	}
	if done.FinishedAt == nil {
		t.Error("FinishedAt should be set after MarkDone")
	}
}

// TestCancelTask_RequiresReason verifies that CancelTask rejects an empty reason
// and succeeds with a non-empty reason.
func TestCancelTask_RequiresReason(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-cancel@example.com", "Owner Cancel")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "Cancelable", "", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	// Empty reason should fail.
	_, err = env.taskSvc.CancelTask(ctx, task.ID, owner.ID, "")
	assertPlatformError(t, err, "task.reason_required")

	// Whitespace-only reason should also fail.
	_, err = env.taskSvc.CancelTask(ctx, task.ID, owner.ID, "   ")
	assertPlatformError(t, err, "task.reason_required")

	// Valid reason succeeds.
	cancelled, err := env.taskSvc.CancelTask(ctx, task.ID, owner.ID, "No longer needed")
	if err != nil {
		t.Fatalf("CancelTask: %v", err)
	}
	if cancelled.Status != "cancelled" {
		t.Errorf("status = %q, want cancelled", cancelled.Status)
	}
}

// TestDelayTask_RequiresLaterDateAndReason verifies the business rules for
// DelayTask: new estimate must be strictly after the current one, and a reason
// is required.
func TestDelayTask_RequiresLaterDateAndReason(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-delay@example.com", "Owner Delay")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "Delayable", "", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	estimate := time.Now().Add(1 * time.Hour)
	task, err = env.taskSvc.TakeTask(ctx, task.ID, owner.ID, estimate)
	if err != nil {
		t.Fatalf("TakeTask: %v", err)
	}

	// Same estimate — not strictly later → error.
	// We need to re-fetch the exact stored estimate to use it.
	stored := *task.EstimatedFinishAt
	_, err = env.taskSvc.DelayTask(ctx, task.ID, owner.ID, stored, "slipped")
	assertPlatformError(t, err, "task.delay_not_later")

	// Earlier estimate → error.
	earlier := time.Now().Add(30 * time.Minute)
	_, err = env.taskSvc.DelayTask(ctx, task.ID, owner.ID, earlier, "slipped")
	assertPlatformError(t, err, "task.delay_not_later")

	// Later estimate but empty reason → error.
	later := time.Now().Add(2 * time.Hour)
	_, err = env.taskSvc.DelayTask(ctx, task.ID, owner.ID, later, "")
	assertPlatformError(t, err, "task.reason_required")

	// Valid: later estimate + non-empty reason.
	delayed, err := env.taskSvc.DelayTask(ctx, task.ID, owner.ID, later, "slipped")
	if err != nil {
		t.Fatalf("DelayTask: %v", err)
	}
	if delayed.EstimatedFinishAt == nil {
		t.Fatal("EstimatedFinishAt should be set")
	}
	if !delayed.EstimatedFinishAt.After(stored) {
		t.Errorf("EstimatedFinishAt %v not after original estimate %v", *delayed.EstimatedFinishAt, stored)
	}
}

// TestReopenTask_RequiresComment verifies that ReopenTask from done requires a
// comment, and on success the status is "todo" and assignee is cleared.
func TestReopenTask_RequiresComment(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-reopen@example.com", "Owner Reopen")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "Reopenable", "", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	// Drive task to done.
	estimate := time.Now().Add(24 * time.Hour)
	task, err = env.taskSvc.TakeTask(ctx, task.ID, owner.ID, estimate)
	if err != nil {
		t.Fatalf("TakeTask: %v", err)
	}
	sampleID := uuid.New()
	if _, err = env.taskSvc.AddReference(ctx, task.ID, "sample", sampleID, owner.ID); err != nil {
		t.Fatalf("AddReference: %v", err)
	}
	task, err = env.taskSvc.MarkDone(ctx, task.ID, owner.ID)
	if err != nil {
		t.Fatalf("MarkDone: %v", err)
	}
	if task.Status != "done" {
		t.Fatalf("pre-condition: status = %q, want done", task.Status)
	}

	// Empty comment → error.
	_, err = env.taskSvc.ReopenTask(ctx, task.ID, "todo", owner.ID, "", nil)
	assertPlatformError(t, err, "task.comment_required")

	// Valid reopen to "todo".
	reopened, err := env.taskSvc.ReopenTask(ctx, task.ID, "todo", owner.ID, "Needs more work", nil)
	if err != nil {
		t.Fatalf("ReopenTask: %v", err)
	}
	if reopened.Status != "todo" {
		t.Errorf("status = %q, want todo", reopened.Status)
	}
	if reopened.AssigneeUserID != nil {
		t.Errorf("assignee should be cleared after reopen-to-todo, got %v", reopened.AssigneeUserID)
	}
}

// TestProgressHistory_TakeThenCancel verifies the progress trail ordering:
// created → status_change(in_progress) → status_change(cancelled).
func TestProgressHistory_TakeThenCancel(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-history@example.com", "Owner History")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "History Task", "", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	estimate := time.Now().Add(24 * time.Hour)
	_, err = env.taskSvc.TakeTask(ctx, task.ID, owner.ID, estimate)
	if err != nil {
		t.Fatalf("TakeTask: %v", err)
	}

	_, err = env.taskSvc.CancelTask(ctx, task.ID, owner.ID, "cancelled by test")
	if err != nil {
		t.Fatalf("CancelTask: %v", err)
	}

	progress, err := env.taskSvc.ListProgress(ctx, task.ID)
	if err != nil {
		t.Fatalf("ListProgress: %v", err)
	}

	// Expect: created, status_change (to in_progress), status_change (to cancelled).
	if len(progress) < 3 {
		t.Fatalf("progress count = %d, want >= 3", len(progress))
	}

	if progress[0].EventType != "created" {
		t.Errorf("progress[0].event_type = %q, want created", progress[0].EventType)
	}

	// Second entry: status_change to in_progress.
	if progress[1].EventType != "status_change" {
		t.Errorf("progress[1].event_type = %q, want status_change", progress[1].EventType)
	}
	if progress[1].ToStatus == nil || *progress[1].ToStatus != "in_progress" {
		t.Errorf("progress[1].to_status = %v, want in_progress", progress[1].ToStatus)
	}

	// Third entry: status_change to cancelled.
	if progress[2].EventType != "status_change" {
		t.Errorf("progress[2].event_type = %q, want status_change", progress[2].EventType)
	}
	if progress[2].ToStatus == nil || *progress[2].ToStatus != "cancelled" {
		t.Errorf("progress[2].to_status = %v, want cancelled", progress[2].ToStatus)
	}
}

// TestCalendarSync_TakeUpsertsAndDoneClears verifies that TakeTask creates exactly
// one calendar event, DelayTask is idempotent (still one event), and MarkDone
// removes it.
func TestCalendarSync_TakeUpsertsAndDoneClears(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-cal@example.com", "Owner Cal")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "Calendar Task", "", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	estimate := time.Now().Add(24 * time.Hour).Truncate(time.Second)
	_, err = env.taskSvc.TakeTask(ctx, task.ID, owner.ID, estimate)
	if err != nil {
		t.Fatalf("TakeTask: %v", err)
	}

	// Exactly one calendar event for this task.
	var count int
	if err := env.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_events WHERE task_id = $1`, task.ID,
	).Scan(&count); err != nil {
		t.Fatalf("count events: %v", err)
	}
	if count != 1 {
		t.Errorf("event count after TakeTask = %d, want 1", count)
	}

	// Verify it's a deadline event with start_at ≈ estimate.
	var kind string
	var startAt time.Time
	if err := env.pool.QueryRow(ctx,
		`SELECT kind, start_at FROM project_events WHERE task_id = $1`, task.ID,
	).Scan(&kind, &startAt); err != nil {
		t.Fatalf("query event: %v", err)
	}
	if kind != "deadline" {
		t.Errorf("event kind = %q, want deadline", kind)
	}
	diff := startAt.UTC().Sub(estimate.UTC())
	if diff < -time.Second || diff > time.Second {
		t.Errorf("event start_at = %v, want ≈ %v", startAt, estimate)
	}

	// DelayTask: still exactly one event (idempotent upsert).
	laterEstimate := estimate.Add(2 * time.Hour)
	_, err = env.taskSvc.DelayTask(ctx, task.ID, owner.ID, laterEstimate, "slipped in test")
	if err != nil {
		t.Fatalf("DelayTask: %v", err)
	}
	if err := env.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_events WHERE task_id = $1`, task.ID,
	).Scan(&count); err != nil {
		t.Fatalf("count events after delay: %v", err)
	}
	if count != 1 {
		t.Errorf("event count after DelayTask = %d, want 1 (idempotent)", count)
	}

	// MarkDone should clear the calendar event.
	sampleID := uuid.New()
	if _, err = env.taskSvc.AddReference(ctx, task.ID, "sample", sampleID, owner.ID); err != nil {
		t.Fatalf("AddReference: %v", err)
	}
	_, err = env.taskSvc.MarkDone(ctx, task.ID, owner.ID)
	if err != nil {
		t.Fatalf("MarkDone: %v", err)
	}
	if err := env.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_events WHERE task_id = $1`, task.ID,
	).Scan(&count); err != nil {
		t.Fatalf("count events after done: %v", err)
	}
	if count != 0 {
		t.Errorf("event count after MarkDone = %d, want 0", count)
	}
}

// TestDeleteTask_RemovesCalendarAndCascades verifies that DeleteTask removes the
// calendar event and deletes the task row (GetTask returns not_found afterward).
func TestDeleteTask_RemovesCalendarAndCascades(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner-delete@example.com", "Owner Delete")
	proj := seedProject(t, env, owner.ID)

	task, err := env.taskSvc.createTask(ctx, proj.ID, nil, "Deletable Task", "", nil, owner.ID)
	if err != nil {
		t.Fatalf("createTask: %v", err)
	}

	estimate := time.Now().Add(24 * time.Hour)
	_, err = env.taskSvc.TakeTask(ctx, task.ID, owner.ID, estimate)
	if err != nil {
		t.Fatalf("TakeTask: %v", err)
	}

	// Verify calendar event exists.
	var count int
	if err := env.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_events WHERE task_id = $1`, task.ID,
	).Scan(&count); err != nil {
		t.Fatalf("count events pre-delete: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 calendar event before delete, got %d", count)
	}

	// Delete the task.
	if err := env.taskSvc.DeleteTask(ctx, task.ID); err != nil {
		t.Fatalf("DeleteTask: %v", err)
	}

	// Calendar event should be gone.
	if err := env.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_events WHERE task_id = $1`, task.ID,
	).Scan(&count); err != nil {
		t.Fatalf("count events post-delete: %v", err)
	}
	if count != 0 {
		t.Errorf("event count after DeleteTask = %d, want 0", count)
	}

	// Task row should be gone.
	_, err = env.taskSvc.GetTask(ctx, task.ID)
	if err == nil {
		t.Fatal("expected GetTask to return error after DeleteTask, got nil")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404 not_found, got %v", err)
	}
}
