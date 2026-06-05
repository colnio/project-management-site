// Package task implements the Task module: structured task tracking scoped to
// projects and optionally iterations, with status transitions, assignee
// notifications, calendar deadline sync, and a progress audit trail.
//
// Authorization always delegates to project.Service.Authorize so that
// workspace/visibility/collaborator rules are enforced consistently.
package task

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/calendar"
	"github.com/colnio/project-management-site/internal/iteration"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// Task is the core domain struct for a project task.
type Task struct {
	ID                uuid.UUID  `json:"id"`
	ProjectID         uuid.UUID  `json:"project_id"`
	IterationID       *uuid.UUID `json:"iteration_id,omitempty"`
	Seq               int        `json:"seq"`
	Title             string     `json:"title"`
	Description       string     `json:"description"`
	Status            string     `json:"status"`
	AssigneeUserID    *uuid.UUID `json:"assignee_user_id,omitempty"`
	ActualExecutorID  *uuid.UUID `json:"actual_executor_id,omitempty"`
	PlannedStartAt    *time.Time `json:"planned_start_at,omitempty"`
	EstimatedFinishAt *time.Time `json:"estimated_finish_at,omitempty"`
	StartedAt         *time.Time `json:"started_at,omitempty"`
	FinishedAt        *time.Time `json:"finished_at,omitempty"`
	CreatedBy         uuid.UUID  `json:"created_by"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// TaskReference is a link from a task to a sample, experiment, page, user, or
// project. Label is a denormalized display string captured at add time so
// cross-workspace references render without an extra lookup.
type TaskReference struct {
	ID        uuid.UUID `json:"id"`
	TaskID    uuid.UUID `json:"task_id"`
	RefType   string    `json:"ref_type"`
	RefID     uuid.UUID `json:"ref_id"`
	Label     string    `json:"label"`
	CreatedBy uuid.UUID `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// TaskProgress is an entry in a task's progress / audit trail.
type TaskProgress struct {
	ID           uuid.UUID  `json:"id"`
	TaskID       uuid.UUID  `json:"task_id"`
	AuthorID     uuid.UUID  `json:"author_id"`
	AuthorName   string     `json:"author_name"`
	EventType    string     `json:"event_type"`
	FromStatus   *string    `json:"from_status,omitempty"`
	ToStatus     *string    `json:"to_status,omitempty"`
	FromAssignee *uuid.UUID `json:"from_assignee,omitempty"`
	ToAssignee   *uuid.UUID `json:"to_assignee,omitempty"`
	Reason       string     `json:"reason"`
	CreatedAt    time.Time  `json:"created_at"`
}

// AssigneeNotifier sends email notifications when a task is assigned.
type AssigneeNotifier interface {
	EnqueueTaskAssigned(ctx context.Context, taskID, projectID, assigneeUserID uuid.UUID, toEmail, projectName, taskTitle, actionPath, idempotencyKey string) error
}

// Mentioner records an @-mention (and notifies the mentioned user). Satisfied by
// *mention.Service. Used when a task gains a ref_type='user' reference.
type Mentioner interface {
	Create(ctx context.Context, actorID, mentionedUserID uuid.UUID, sourceType string, sourceID uuid.UUID, projectID, workspaceID *uuid.UUID, link, snippet string) error
}

// Service is the task module's domain service.
type Service struct {
	pool       *pgxpool.Pool
	projects   *project.Service
	iterations *iteration.Service
	calendar   *calendar.Service
	rec        audit.Recorder
	log        *slog.Logger
	notify     AssigneeNotifier
	mentions   Mentioner
}

// NewService constructs a Service.
func NewService(
	pool *pgxpool.Pool,
	projects *project.Service,
	iterations *iteration.Service,
	cal *calendar.Service,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:       pool,
		projects:   projects,
		iterations: iterations,
		calendar:   cal,
		rec:        rec,
		log:        log,
	}
}

// SetAssigneeNotifier wires the notify module for task assigned emails.
func (s *Service) SetAssigneeNotifier(n AssigneeNotifier) {
	s.notify = n
}

// SetMentioner wires the mention module so user references notify the person.
func (s *Service) SetMentioner(m Mentioner) {
	s.mentions = m
}

// ─── Scan helpers ─────────────────────────────────────────────────────────────

const taskCols = `id, project_id, iteration_id, seq, title, description, status,
	assignee_user_id, actual_executor_id, planned_start_at, estimated_finish_at, started_at, finished_at,
	created_by, created_at, updated_at`

func scanTask(row pgx.Row) (*Task, error) {
	var t Task
	err := row.Scan(
		&t.ID, &t.ProjectID, &t.IterationID, &t.Seq, &t.Title, &t.Description, &t.Status,
		&t.AssigneeUserID, &t.ActualExecutorID, &t.PlannedStartAt, &t.EstimatedFinishAt, &t.StartedAt, &t.FinishedAt,
		&t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("task.not_found", "task not found")
	}
	if err != nil {
		return nil, fmt.Errorf("task: scan: %w", err)
	}
	return &t, nil
}

func collectTasks(rows pgx.Rows) ([]*Task, error) {
	var result []*Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("task: rows error: %w", err)
	}
	return result, nil
}

// ─── insertProgressTx ─────────────────────────────────────────────────────────

func insertProgressTx(
	ctx context.Context,
	tx pgx.Tx,
	taskID uuid.UUID,
	authorID uuid.UUID,
	eventType string,
	fromStatus, toStatus *string,
	fromAssignee, toAssignee *uuid.UUID,
	reason string,
) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO task_progress
		   (task_id, author_id, event_type, from_status, to_status, from_assignee, to_assignee, reason)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		taskID, authorID, eventType, fromStatus, toStatus, fromAssignee, toAssignee, reason,
	)
	if err != nil {
		return fmt.Errorf("task: insert progress %s: %w", eventType, err)
	}
	return nil
}

// ─── GetTask ─────────────────────────────────────────────────────────────────

// GetTask loads a task by id. Returns platform.NotFound if absent.
func (s *Service) GetTask(ctx context.Context, id uuid.UUID) (*Task, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+taskCols+` FROM tasks WHERE id = $1`, id)
	return scanTask(row)
}

// ─── createTask ──────────────────────────────────────────────────────────────

func (s *Service) createTask(
	ctx context.Context,
	projectID uuid.UUID,
	iterationID *uuid.UUID,
	title, description string,
	assigneeUserID *uuid.UUID,
	actualExecutorID *uuid.UUID,
	plannedStartAt *time.Time,
	estimatedFinishAt *time.Time,
	startedAt *time.Time,
	finishedAt *time.Time,
	createdBy uuid.UUID,
) (*Task, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("task: create: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	row := tx.QueryRow(ctx,
		`INSERT INTO tasks
		   (project_id, iteration_id, seq, title, description,
		    assignee_user_id, actual_executor_id,
		    planned_start_at, estimated_finish_at, started_at, finished_at,
		    created_by)
		 VALUES ($1, $2,
		         COALESCE((SELECT MAX(seq) FROM tasks WHERE project_id = $1), 0) + 1,
		         $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING `+taskCols,
		projectID, iterationID, title, description,
		assigneeUserID, actualExecutorID,
		plannedStartAt, estimatedFinishAt, startedAt, finishedAt,
		createdBy,
	)
	t, err := scanTask(row)
	if err != nil {
		return nil, err
	}

	if err := insertProgressTx(ctx, tx, t.ID, createdBy, "created", nil, nil, nil, nil, ""); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("task: create: commit: %w", err)
	}

	if plannedStartAt != nil {
		syncCalendarEvents(ctx, s, t)
	}

	return t, nil
}

// ─── listByProject ───────────────────────────────────────────────────────────

type listFilters struct {
	status      *string
	assigneeID  *uuid.UUID
	iterationID *uuid.UUID
	q           string
}

func (s *Service) listByProject(ctx context.Context, projectID uuid.UUID, f listFilters) ([]*Task, error) {
	query := `SELECT ` + taskCols + ` FROM tasks WHERE project_id = $1`
	args := []any{projectID}
	argIdx := 2

	appendArg := func(clause string, val any) {
		query += fmt.Sprintf(" AND %s = $%d", clause, argIdx)
		args = append(args, val)
		argIdx++
	}

	if f.status != nil {
		appendArg("status", *f.status)
	}
	if f.assigneeID != nil {
		appendArg("assignee_user_id", *f.assigneeID)
	}
	if f.iterationID != nil {
		appendArg("iteration_id", *f.iterationID)
	}
	if f.q != "" {
		query += fmt.Sprintf(" AND title ILIKE $%d", argIdx)
		args = append(args, "%"+f.q+"%")
		argIdx++
	}
	_ = argIdx

	query += " ORDER BY seq ASC"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("task: list by project: %w", err)
	}
	defer rows.Close()
	return collectTasks(rows)
}

// ─── listByIteration ─────────────────────────────────────────────────────────

func (s *Service) listByIteration(ctx context.Context, iterationID uuid.UUID) ([]*Task, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+taskCols+` FROM tasks WHERE iteration_id = $1 ORDER BY seq ASC`,
		iterationID,
	)
	if err != nil {
		return nil, fmt.Errorf("task: list by iteration: %w", err)
	}
	defer rows.Close()
	return collectTasks(rows)
}

// ─── patchTask ───────────────────────────────────────────────────────────────

// patchTask applies metadata/date updates only (not status). iterationID is a
// double pointer: outer nil = unchanged, outer non-nil inner nil = clear to NULL,
// outer non-nil inner non-nil = set to value. Same for plannedStartAt and
// estimatedFinishAt.
func (s *Service) patchTask(
	ctx context.Context,
	id uuid.UUID,
	title, description *string,
	iterationID **uuid.UUID,
	plannedStartAt, estimatedFinishAt **time.Time,
) (*Task, error) {
	setClauses := []string{"updated_at = now()"}
	args := []any{id} // $1
	argIdx := 2

	appendArg := func(clause string, val any) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", clause, argIdx))
		args = append(args, val)
		argIdx++
	}

	if title != nil {
		appendArg("title", *title)
	}
	if description != nil {
		appendArg("description", *description)
	}
	if iterationID != nil {
		// outer non-nil means "set"; inner value may be nil (clear) or non-nil (set to UUID)
		appendArg("iteration_id", *iterationID)
	}
	if plannedStartAt != nil {
		appendArg("planned_start_at", *plannedStartAt)
	}
	if estimatedFinishAt != nil {
		appendArg("estimated_finish_at", *estimatedFinishAt)
	}

	query := "UPDATE tasks SET "
	for i, c := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += c
	}
	query += " WHERE id = $1 RETURNING " + taskCols

	row := s.pool.QueryRow(ctx, query, args...)
	t, err := scanTask(row)
	if err != nil {
		return nil, err
	}

	syncCalendarEvents(ctx, s, t)

	return t, nil
}

// ─── TakeTask ────────────────────────────────────────────────────────────────

// TakeTask transitions a task from todo/backlog to in_progress, assigning it
// to the actor.
func (s *Service) TakeTask(ctx context.Context, taskID, actorID uuid.UUID, estimatedFinishAt time.Time) (*Task, error) {
	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if t.Status != "todo" && t.Status != "backlog" {
		return nil, platform.BadRequest("task.invalid_transition", "task must be in todo or backlog to take")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("task: take: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	fromStatus := t.Status
	toStatus := "in_progress"
	row := tx.QueryRow(ctx,
		`UPDATE tasks
		 SET status = 'in_progress', assignee_user_id = $2, estimated_finish_at = $3,
		     started_at = now(), updated_at = now()
		 WHERE id = $1
		 RETURNING `+taskCols,
		taskID, actorID, estimatedFinishAt,
	)
	t, err = scanTask(row)
	if err != nil {
		return nil, err
	}

	if err := insertProgressTx(ctx, tx, taskID, actorID, "status_change",
		&fromStatus, &toStatus, nil, &actorID, ""); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("task: take: commit: %w", err)
	}

	syncCalendarEvents(ctx, s, t)
	notifyAssignee(ctx, s, t, actorID)

	return t, nil
}

// ─── ReassignTask ─────────────────────────────────────────────────────────────

// ReassignTask changes the assignee of a task.
func (s *Service) ReassignTask(ctx context.Context, taskID, newAssignee, actorID uuid.UUID, comment string) (*Task, error) {
	if strings.TrimSpace(comment) == "" {
		return nil, platform.BadRequest("task.comment_required", "a comment is required")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("task: reassign: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	oldAssignee := t.AssigneeUserID

	row := tx.QueryRow(ctx,
		`UPDATE tasks SET assignee_user_id = $2, updated_at = now()
		 WHERE id = $1 RETURNING `+taskCols,
		taskID, newAssignee,
	)
	t, err = scanTask(row)
	if err != nil {
		return nil, err
	}

	if err := insertProgressTx(ctx, tx, taskID, actorID, "reassign",
		nil, nil, oldAssignee, &newAssignee, comment); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("task: reassign: commit: %w", err)
	}

	if oldAssignee == nil || *oldAssignee != newAssignee {
		notifyAssignee(ctx, s, t, newAssignee)
	}

	return t, nil
}

// ─── CancelTask ──────────────────────────────────────────────────────────────

// CancelTask transitions a task to cancelled status.
func (s *Service) CancelTask(ctx context.Context, taskID, actorID uuid.UUID, reason string) (*Task, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, platform.BadRequest("task.reason_required", "a reason is required")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if t.Status == "done" || t.Status == "cancelled" {
		return nil, platform.BadRequest("task.invalid_transition", "task is already done or cancelled")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("task: cancel: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	fromStatus := t.Status
	toStatus := "cancelled"
	row := tx.QueryRow(ctx,
		`UPDATE tasks SET status = 'cancelled', updated_at = now()
		 WHERE id = $1 RETURNING `+taskCols,
		taskID,
	)
	t, err = scanTask(row)
	if err != nil {
		return nil, err
	}

	if err := insertProgressTx(ctx, tx, taskID, actorID, "status_change",
		&fromStatus, &toStatus, nil, nil, reason); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("task: cancel: commit: %w", err)
	}

	clearCalendarEvents(ctx, s, taskID)

	return t, nil
}

// ─── ReopenTask ──────────────────────────────────────────────────────────────

// ReopenTask transitions a done/cancelled task back to todo or in_progress.
func (s *Service) ReopenTask(ctx context.Context, taskID uuid.UUID, target string, actorID uuid.UUID, comment string, estimate *time.Time) (*Task, error) {
	if target != "todo" && target != "in_progress" {
		return nil, platform.BadRequest("task.invalid_target", "target_status must be 'todo' or 'in_progress'")
	}
	if strings.TrimSpace(comment) == "" {
		return nil, platform.BadRequest("task.comment_required", "a comment is required")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if t.Status != "done" && t.Status != "cancelled" {
		return nil, platform.BadRequest("task.invalid_transition", "task must be done or cancelled to reopen")
	}

	if target == "in_progress" && estimate == nil {
		return nil, platform.BadRequest("task.estimate_required", "estimated_finish_at is required when reopening to in_progress")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("task: reopen: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	fromStatus := t.Status
	var row pgx.Row
	if target == "in_progress" {
		row = tx.QueryRow(ctx,
			`UPDATE tasks
			 SET status = 'in_progress', estimated_finish_at = $2,
			     started_at = COALESCE(started_at, now()), finished_at = NULL, updated_at = now()
			 WHERE id = $1 RETURNING `+taskCols,
			taskID, *estimate,
		)
	} else {
		// target == "todo"
		row = tx.QueryRow(ctx,
			`UPDATE tasks
			 SET status = 'todo', assignee_user_id = NULL,
			     started_at = NULL, finished_at = NULL, estimated_finish_at = NULL,
			     updated_at = now()
			 WHERE id = $1 RETURNING `+taskCols,
			taskID,
		)
	}
	t, err = scanTask(row)
	if err != nil {
		return nil, err
	}

	if err := insertProgressTx(ctx, tx, taskID, actorID, "reopen",
		&fromStatus, &target, nil, nil, comment); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("task: reopen: commit: %w", err)
	}

	syncCalendarEvents(ctx, s, t)

	return t, nil
}

// ─── MarkDone ────────────────────────────────────────────────────────────────

// MarkDone transitions an in_progress task to done. Requires at least one reference.
func (s *Service) MarkDone(ctx context.Context, taskID, actorID uuid.UUID) (*Task, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("task: mark done: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var currentStatus string
	if err := tx.QueryRow(ctx,
		`SELECT status FROM tasks WHERE id = $1 FOR UPDATE`,
		taskID,
	).Scan(&currentStatus); err != nil {
		if err == pgx.ErrNoRows {
			return nil, platform.NotFound("task.not_found", "task not found")
		}
		return nil, fmt.Errorf("task: mark done: lock row: %w", err)
	}
	if currentStatus != "in_progress" {
		return nil, platform.BadRequest("task.invalid_transition", "task must be in_progress to mark done")
	}

	// Only sample/experiment/page references satisfy the close gate — a task
	// referencing only people or other projects has produced no linked artifact.
	var refCount int
	if err := tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM task_references
		 WHERE task_id = $1 AND ref_type IN ('sample','experiment','page')`,
		taskID,
	).Scan(&refCount); err != nil {
		return nil, fmt.Errorf("task: mark done: count references: %w", err)
	}
	if refCount == 0 {
		return nil, platform.BadRequest("task.references_required",
			"at least one reference (sample, experiment, or page) is required to mark a task done")
	}

	fromStatus := currentStatus
	toStatus := "done"
	row := tx.QueryRow(ctx,
		`UPDATE tasks SET status = 'done', finished_at = now(), updated_at = now()
		 WHERE id = $1 RETURNING `+taskCols,
		taskID,
	)
	t, err := scanTask(row)
	if err != nil {
		return nil, err
	}

	if err := insertProgressTx(ctx, tx, taskID, actorID, "status_change",
		&fromStatus, &toStatus, nil, nil, ""); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("task: mark done: commit: %w", err)
	}

	clearCalendarEvents(ctx, s, taskID)

	return t, nil
}

// ─── DelayTask ───────────────────────────────────────────────────────────────

// DelayTask pushes the estimated_finish_at of a task to a later date.
func (s *Service) DelayTask(ctx context.Context, taskID, actorID uuid.UUID, newEstimate time.Time, reason string) (*Task, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, platform.BadRequest("task.reason_required", "a reason is required")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if t.EstimatedFinishAt == nil {
		return nil, platform.BadRequest("task.no_estimate", "task has no current estimated finish date")
	}
	if !newEstimate.After(*t.EstimatedFinishAt) {
		return nil, platform.BadRequest("task.delay_not_later", "new estimate must be strictly after the current estimate")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("task: delay: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	row := tx.QueryRow(ctx,
		`UPDATE tasks SET estimated_finish_at = $2, updated_at = now()
		 WHERE id = $1 RETURNING `+taskCols,
		taskID, newEstimate,
	)
	t, err = scanTask(row)
	if err != nil {
		return nil, err
	}

	if err := insertProgressTx(ctx, tx, taskID, actorID, "delay",
		nil, nil, nil, nil, reason); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("task: delay: commit: %w", err)
	}

	syncCalendarEvents(ctx, s, t)

	return t, nil
}

// ─── AddReference ────────────────────────────────────────────────────────────

// AddReference attaches a sample, experiment, page, user, or project reference to
// a task. label is a denormalized display string captured by the caller (e.g. the
// sample identifier or person's name) so the chip renders without a lookup.
func (s *Service) AddReference(ctx context.Context, taskID uuid.UUID, refType string, refID, actorID uuid.UUID, label string) (*TaskReference, error) {
	validTypes := map[string]bool{"sample": true, "experiment": true, "page": true, "user": true, "project": true}
	if !validTypes[refType] {
		return nil, platform.BadRequest("task.invalid_ref_type", "ref_type must be sample, experiment, page, user, or project")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("task: add reference: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx,
		`INSERT INTO task_references (task_id, ref_type, ref_id, label, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (task_id, ref_type, ref_id) DO UPDATE SET label = EXCLUDED.label`,
		taskID, refType, refID, label, actorID,
	)
	if err != nil {
		return nil, fmt.Errorf("task: add reference: insert: %w", err)
	}

	var ref TaskReference
	if err := tx.QueryRow(ctx,
		`SELECT id, task_id, ref_type, ref_id, label, created_by, created_at
		 FROM task_references WHERE task_id = $1 AND ref_type = $2 AND ref_id = $3`,
		taskID, refType, refID,
	).Scan(&ref.ID, &ref.TaskID, &ref.RefType, &ref.RefID, &ref.Label, &ref.CreatedBy, &ref.CreatedAt); err != nil {
		return nil, fmt.Errorf("task: add reference: reload: %w", err)
	}

	reason := refType + ":" + refID.String()
	if err := insertProgressTx(ctx, tx, taskID, actorID, "reference_added",
		nil, nil, nil, nil, reason); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("task: add reference: commit: %w", err)
	}

	// A user reference is an @-mention of that person — record + notify (best-effort).
	if refType == "user" && s.mentions != nil {
		if t, terr := s.GetTask(ctx, taskID); terr != nil {
			s.log.Warn("task: load task for mention", "err", terr)
		} else {
			pid := t.ProjectID
			var wsID *uuid.UUID
			if proj, perr := s.projects.GetProject(ctx, t.ProjectID); perr != nil {
				s.log.Warn("task: load project for mention", "err", perr)
			} else {
				ws := proj.WorkspaceID
				wsID = &ws
			}
			link := fmt.Sprintf("/projects/%s?tab=tasks&task=%s", t.ProjectID, taskID)
			if merr := s.mentions.Create(ctx, actorID, refID, "task", taskID, &pid, wsID, link, t.Title); merr != nil {
				s.log.Warn("task: create mention failed", "err", merr)
			}
		}
	}

	return &ref, nil
}

// ─── RemoveReference ─────────────────────────────────────────────────────────

// RemoveReference removes a reference from a task.
func (s *Service) RemoveReference(ctx context.Context, taskID uuid.UUID, refType string, refID, actorID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("task: remove reference: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	tag, err := tx.Exec(ctx,
		`DELETE FROM task_references WHERE task_id = $1 AND ref_type = $2 AND ref_id = $3`,
		taskID, refType, refID,
	)
	if err != nil {
		return fmt.Errorf("task: remove reference: delete: %w", err)
	}

	if tag.RowsAffected() > 0 {
		reason := refType + ":" + refID.String()
		if err := insertProgressTx(ctx, tx, taskID, actorID, "reference_removed",
			nil, nil, nil, nil, reason); err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("task: remove reference: commit: %w", err)
	}

	return nil
}

// ─── ListReferences ──────────────────────────────────────────────────────────

// ListReferences returns all references for a task ordered by created_at.
func (s *Service) ListReferences(ctx context.Context, taskID uuid.UUID) ([]*TaskReference, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, task_id, ref_type, ref_id, label, created_by, created_at
		 FROM task_references WHERE task_id = $1 ORDER BY created_at ASC`,
		taskID,
	)
	if err != nil {
		return nil, fmt.Errorf("task: list references: %w", err)
	}
	defer rows.Close()

	var result []*TaskReference
	for rows.Next() {
		var r TaskReference
		if err := rows.Scan(&r.ID, &r.TaskID, &r.RefType, &r.RefID, &r.Label, &r.CreatedBy, &r.CreatedAt); err != nil {
			return nil, fmt.Errorf("task: list references: scan: %w", err)
		}
		result = append(result, &r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("task: list references: rows error: %w", err)
	}
	return result, nil
}

// ─── AddProgressComment ──────────────────────────────────────────────────────

// AddProgressComment adds a freeform comment to the task's progress trail.
func (s *Service) AddProgressComment(ctx context.Context, taskID, actorID uuid.UUID, body string) (*TaskProgress, error) {
	if strings.TrimSpace(body) == "" {
		return nil, platform.BadRequest("task.comment_required", "a comment is required")
	}

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx,
		`INSERT INTO task_progress (task_id, author_id, event_type, reason)
		 VALUES ($1, $2, 'comment', $3)
		 RETURNING id`,
		taskID, actorID, body,
	).Scan(&id); err != nil {
		return nil, fmt.Errorf("task: add comment: insert: %w", err)
	}

	// Reload with author_name via JOIN.
	row := s.pool.QueryRow(ctx,
		`SELECT tp.id, tp.task_id, tp.author_id,
		        COALESCE(NULLIF(u.display_name,''), u.email) AS author_name,
		        tp.event_type, tp.from_status, tp.to_status,
		        tp.from_assignee, tp.to_assignee, tp.reason, tp.created_at
		 FROM task_progress tp
		 JOIN users u ON u.id = tp.author_id
		 WHERE tp.id = $1`,
		id,
	)
	p, err := scanProgress(row)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// ─── ListProgress ────────────────────────────────────────────────────────────

// ListProgress returns the full progress trail for a task ordered by created_at.
func (s *Service) ListProgress(ctx context.Context, taskID uuid.UUID) ([]*TaskProgress, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT tp.id, tp.task_id, tp.author_id,
		        COALESCE(NULLIF(u.display_name,''), u.email) AS author_name,
		        tp.event_type, tp.from_status, tp.to_status,
		        tp.from_assignee, tp.to_assignee, tp.reason, tp.created_at
		 FROM task_progress tp
		 JOIN users u ON u.id = tp.author_id
		 WHERE tp.task_id = $1
		 ORDER BY tp.created_at ASC`,
		taskID,
	)
	if err != nil {
		return nil, fmt.Errorf("task: list progress: %w", err)
	}
	defer rows.Close()

	var result []*TaskProgress
	for rows.Next() {
		p, err := scanProgress(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("task: list progress: rows error: %w", err)
	}
	return result, nil
}

func scanProgress(row pgx.Row) (*TaskProgress, error) {
	var p TaskProgress
	if err := row.Scan(
		&p.ID, &p.TaskID, &p.AuthorID, &p.AuthorName,
		&p.EventType, &p.FromStatus, &p.ToStatus,
		&p.FromAssignee, &p.ToAssignee, &p.Reason, &p.CreatedAt,
	); err != nil {
		return nil, fmt.Errorf("task: scan progress: %w", err)
	}
	return &p, nil
}

// ─── DeleteTask ──────────────────────────────────────────────────────────────

// DeleteTask deletes a task (cascade removes children) and clears its calendar events.
func (s *Service) DeleteTask(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("task: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("task.not_found", "task not found")
	}
	if err := s.calendar.DeleteTaskEvents(ctx, id); err != nil {
		s.log.Warn("task: delete calendar events", "err", err)
	}
	return nil
}

// ─── syncCalendarEvents ──────────────────────────────────────────────────────

// syncCalendarEvents creates or updates the calendar deadline event for the task.
// It is best-effort: errors are logged but not propagated.
func syncCalendarEvents(ctx context.Context, s *Service, t *Task) {
	var when *time.Time
	if t.EstimatedFinishAt != nil {
		when = t.EstimatedFinishAt
	} else if t.PlannedStartAt != nil {
		when = t.PlannedStartAt
	}
	if when != nil {
		if _, err := s.calendar.UpsertTaskEvent(ctx, t.ID, t.ProjectID, t.CreatedBy, t.Title, *when); err != nil {
			s.log.Warn("task: sync calendar", "err", err)
		}
		return
	}
	if err := s.calendar.DeleteTaskEvents(ctx, t.ID); err != nil {
		s.log.Warn("task: sync calendar delete", "err", err)
	}
}

// clearCalendarEvents removes all calendar events for a task (best-effort).
func clearCalendarEvents(ctx context.Context, s *Service, taskID uuid.UUID) {
	if err := s.calendar.DeleteTaskEvents(ctx, taskID); err != nil {
		s.log.Warn("task: clear calendar events", "err", err)
	}
}

// ─── notifyAssignee ──────────────────────────────────────────────────────────

// notifyAssignee sends an email notification to the task assignee (best-effort).
func notifyAssignee(ctx context.Context, s *Service, t *Task, assigneeID uuid.UUID) {
	if s.notify == nil {
		return
	}

	var toEmail string
	if err := s.pool.QueryRow(ctx,
		`SELECT email FROM users WHERE id = $1`, assigneeID,
	).Scan(&toEmail); err != nil {
		s.log.Warn("task: resolve assignee email", "err", err)
		return
	}

	proj, err := s.projects.GetProject(ctx, t.ProjectID)
	if err != nil {
		s.log.Warn("task: load project for assignee notify", "err", err)
		return
	}

	idem := fmt.Sprintf("task_assigned:%s:%s", t.ID, assigneeID)
	actionPath := "/projects/" + t.ProjectID.String()

	if err := s.notify.EnqueueTaskAssigned(ctx,
		t.ID, t.ProjectID, assigneeID,
		toEmail, proj.Name, t.Title, actionPath, idem,
	); err != nil {
		s.log.Warn("task: enqueue task assigned email failed", "err", err)
	}
}
