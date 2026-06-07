package task

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires task HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// Project-scoped.
	huma.Register(api, huma.Operation{
		OperationID: "task-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/tasks",
		Summary:     "Create a task",
		Description: "Creates a new task within a project. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleCreateTask)

	huma.Register(api, huma.Operation{
		OperationID: "task-list-by-project",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/tasks",
		Summary:     "List tasks in a project",
		Description: "Returns tasks for a project ordered by seq. Supports optional filters. Requires viewer role.",
		Tags:        []string{"tasks"},
	}, svc.handleListByProject)

	// Cross-project: the caller's own assigned tasks.
	huma.Register(api, huma.Operation{
		OperationID: "task-list-mine",
		Method:      http.MethodGet,
		Path:        "/v1/me/tasks",
		Summary:     "List my assigned tasks",
		Description: "Returns the caller's active (backlog/todo/in_progress) tasks across all workspaces, enriched with project and workspace names. Grouped by project with active tasks first.",
		Tags:        []string{"tasks"},
	}, svc.handleListMyTasks)

	// Iteration-scoped.
	huma.Register(api, huma.Operation{
		OperationID: "task-list-by-iteration",
		Method:      http.MethodGet,
		Path:        "/v1/iterations/{id}/tasks",
		Summary:     "List tasks for an iteration",
		Description: "Returns tasks scoped to an iteration. Authorizes via the iteration's project. Requires viewer role.",
		Tags:        []string{"tasks"},
	}, svc.handleListByIteration)

	// Single-task endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "task-get",
		Method:      http.MethodGet,
		Path:        "/v1/tasks/{id}",
		Summary:     "Get a task",
		Description: "Returns a single task by ID. Requires viewer role on the task's project.",
		Tags:        []string{"tasks"},
	}, svc.handleGetTask)

	huma.Register(api, huma.Operation{
		OperationID: "task-patch",
		Method:      http.MethodPatch,
		Path:        "/v1/tasks/{id}",
		Summary:     "Update a task",
		Description: "Applies a partial metadata update to a task (not status). Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handlePatchTask)

	huma.Register(api, huma.Operation{
		OperationID: "task-take",
		Method:      http.MethodPost,
		Path:        "/v1/tasks/{id}/take",
		Summary:     "Take a task",
		Description: "Assigns the task to the caller and transitions it to in_progress. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleTakeTask)

	huma.Register(api, huma.Operation{
		OperationID: "task-reassign",
		Method:      http.MethodPost,
		Path:        "/v1/tasks/{id}/reassign",
		Summary:     "Reassign a task",
		Description: "Changes the assignee of a task. A comment is required. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleReassignTask)

	huma.Register(api, huma.Operation{
		OperationID: "task-cancel",
		Method:      http.MethodPost,
		Path:        "/v1/tasks/{id}/cancel",
		Summary:     "Cancel a task",
		Description: "Transitions a task to cancelled. A reason is required. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleCancelTask)

	huma.Register(api, huma.Operation{
		OperationID: "task-reopen",
		Method:      http.MethodPost,
		Path:        "/v1/tasks/{id}/reopen",
		Summary:     "Reopen a task",
		Description: "Transitions a done/cancelled task back to todo or in_progress. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleReopenTask)

	huma.Register(api, huma.Operation{
		OperationID: "task-delay",
		Method:      http.MethodPost,
		Path:        "/v1/tasks/{id}/delay",
		Summary:     "Delay a task",
		Description: "Pushes the estimated finish date of a task to a later date. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleDelayTask)

	huma.Register(api, huma.Operation{
		OperationID: "task-mark-done",
		Method:      http.MethodPost,
		Path:        "/v1/tasks/{id}/done",
		Summary:     "Mark a task done",
		Description: "Transitions an in_progress task to done. At least one reference is required. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleMarkDone)

	// Reference endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "task-reference-add",
		Method:      http.MethodPost,
		Path:        "/v1/tasks/{id}/references",
		Summary:     "Add a reference to a task",
		Description: "Attaches a sample, experiment, or page reference to the task. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleAddReference)

	huma.Register(api, huma.Operation{
		OperationID: "task-reference-list",
		Method:      http.MethodGet,
		Path:        "/v1/tasks/{id}/references",
		Summary:     "List task references",
		Description: "Returns all references for a task. Requires viewer role.",
		Tags:        []string{"tasks"},
	}, svc.handleListReferences)

	huma.Register(api, huma.Operation{
		OperationID: "task-reference-remove",
		Method:      http.MethodDelete,
		Path:        "/v1/tasks/{id}/references/{ref_type}/{ref_id}",
		Summary:     "Remove a reference from a task",
		Description: "Removes a reference from the task. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleRemoveReference)

	// Progress endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "task-progress-list",
		Method:      http.MethodGet,
		Path:        "/v1/tasks/{id}/progress",
		Summary:     "List task progress",
		Description: "Returns the full progress trail for a task. Requires viewer role.",
		Tags:        []string{"tasks"},
	}, svc.handleListProgress)

	huma.Register(api, huma.Operation{
		OperationID: "task-comment-add",
		Method:      http.MethodPost,
		Path:        "/v1/tasks/{id}/comments",
		Summary:     "Add a comment to a task",
		Description: "Appends a freeform comment to the task's progress trail. Requires editor role.",
		Tags:        []string{"tasks"},
	}, svc.handleAddComment)
}

// ─── Create task ─────────────────────────────────────────────────────────────

type createTaskInput struct {
	ID   string `path:"id"`
	Body struct {
		Title             string `json:"title" required:"true" minLength:"1"`
		Description       string `json:"description,omitempty"`
		IterationID       string `json:"iteration_id,omitempty"`
		AssigneeUserID    string `json:"assignee_user_id,omitempty"`
		PlannedStartAt    string `json:"planned_start_at,omitempty"`
		EstimatedFinishAt string `json:"estimated_finish_at,omitempty"`
		// Note: actual executor / actual start / actual end are NOT settable at
		// creation. They are observed facts inferred from the lifecycle:
		// actual executor + actual start are set when the task is taken, actual
		// end when it is marked done (and stays empty if the task is cancelled).
	}
}

type createTaskOutput struct {
	Status int
	Body   *Task
}

func (s *Service) handleCreateTask(ctx context.Context, in *createTaskInput) (*createTaskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	var iterationID *uuid.UUID
	if in.Body.IterationID != "" {
		parsed, err := uuid.Parse(in.Body.IterationID)
		if err != nil {
			return nil, platform.BadRequest("task.invalid_iteration_id", "invalid iteration ID")
		}
		iterProjID, err := s.iterations.GetProjectIDForIteration(ctx, parsed)
		if err != nil {
			return nil, err
		}
		if iterProjID != projectID {
			return nil, platform.BadRequest("task.iteration_mismatch", "iteration does not belong to this project")
		}
		iterationID = &parsed
	}

	var assigneeUserID *uuid.UUID
	if in.Body.AssigneeUserID != "" {
		parsed, err := uuid.Parse(in.Body.AssigneeUserID)
		if err != nil {
			return nil, platform.BadRequest("task.invalid_assignee_user_id", "assignee_user_id must be a valid UUID")
		}
		assigneeUserID = &parsed
	}

	var plannedStartAt *time.Time
	if in.Body.PlannedStartAt != "" {
		t, err := time.Parse(time.RFC3339, in.Body.PlannedStartAt)
		if err != nil {
			return nil, platform.BadRequest("task.invalid_planned_start_at", "planned_start_at must be RFC3339")
		}
		plannedStartAt = &t
	}

	var estimatedFinishAt *time.Time
	if in.Body.EstimatedFinishAt != "" {
		t, err := time.Parse(time.RFC3339, in.Body.EstimatedFinishAt)
		if err != nil {
			return nil, platform.BadRequest("task.invalid_estimated_finish_at", "estimated_finish_at must be RFC3339")
		}
		estimatedFinishAt = &t
	}

	task, err := s.createTask(ctx, projectID, iterationID,
		in.Body.Title, in.Body.Description,
		assigneeUserID, plannedStartAt, estimatedFinishAt,
		p.UserID)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.create",
		ResourceType: "task",
		ResourceID:   task.ID.String(),
	})

	return &createTaskOutput{Status: http.StatusCreated, Body: task}, nil
}

// ─── List by project ─────────────────────────────────────────────────────────

type listTasksByProjectInput struct {
	ID          string `path:"id"`
	Status      string `query:"status"`
	Assignee    string `query:"assignee_user_id"`
	IterationID string `query:"iteration_id"`
	Q           string `query:"q"`
}

type listTasksOutput struct {
	Body []*Task
}

func (s *Service) handleListByProject(ctx context.Context, in *listTasksByProjectInput) (*listTasksOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadTasks); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	f := listFilters{q: in.Q}
	if in.Status != "" {
		f.status = &in.Status
	}
	if in.Assignee != "" {
		id, err := uuid.Parse(in.Assignee)
		if err != nil {
			return nil, platform.BadRequest("task.invalid_assignee_id", "invalid assignee_user_id")
		}
		f.assigneeID = &id
	}
	if in.IterationID != "" {
		id, err := uuid.Parse(in.IterationID)
		if err != nil {
			return nil, platform.BadRequest("task.invalid_iteration_id", "invalid iteration_id")
		}
		f.iterationID = &id
	}

	list, err := s.listByProject(ctx, projectID, f)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Task{}
	}
	return &listTasksOutput{Body: list}, nil
}

// ─── List my tasks ───────────────────────────────────────────────────────────

type listMyTasksInput struct{}

type listMyTasksOutput struct {
	Body []*AssignedTask
}

func (s *Service) handleListMyTasks(ctx context.Context, _ *listMyTasksInput) (*listMyTasksOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadTasks); err != nil {
		return nil, err
	}

	list, err := s.ListAssignedToUser(ctx, p.UserID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*AssignedTask{}
	}
	return &listMyTasksOutput{Body: list}, nil
}

// ─── List by iteration ───────────────────────────────────────────────────────

type listTasksByIterationInput struct {
	ID string `path:"id"`
}

func (s *Service) handleListByIteration(ctx context.Context, in *listTasksByIterationInput) (*listTasksOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadTasks); err != nil {
		return nil, err
	}

	iterationID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("iteration.invalid_id", "invalid iteration ID")
	}

	projectID, err := s.iterations.GetProjectIDForIteration(ctx, iterationID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	list, err := s.listByIteration(ctx, iterationID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Task{}
	}
	return &listTasksOutput{Body: list}, nil
}

// ─── Get task ─────────────────────────────────────────────────────────────────

type getTaskInput struct {
	ID string `path:"id"`
}

type getTaskOutput struct {
	Body *Task
}

func (s *Service) handleGetTask(ctx context.Context, in *getTaskInput) (*getTaskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	return &getTaskOutput{Body: t}, nil
}

// ─── Patch task ───────────────────────────────────────────────────────────────

type patchTaskInput struct {
	ID   string `path:"id"`
	Body struct {
		Title             *string `json:"title,omitempty"`
		Description       *string `json:"description,omitempty"`
		IterationID       *string `json:"iteration_id,omitempty"`
		PlannedStartAt    *string `json:"planned_start_at,omitempty"`
		EstimatedFinishAt *string `json:"estimated_finish_at,omitempty"`
	}
}

type patchTaskOutput struct {
	Body *Task
}

func (s *Service) handlePatchTask(ctx context.Context, in *patchTaskInput) (*patchTaskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	// Map iteration_id: outer nil = unchanged, outer non-nil = set (inner may be nil to clear).
	var iterationID **uuid.UUID
	if in.Body.IterationID != nil {
		if *in.Body.IterationID == "" {
			// Clear to NULL.
			var nilUUID *uuid.UUID
			iterationID = &nilUUID
		} else {
			parsed, err := uuid.Parse(*in.Body.IterationID)
			if err != nil {
				return nil, platform.BadRequest("task.invalid_iteration_id", "invalid iteration ID")
			}
			parsedPtr := &parsed
			iterationID = &parsedPtr
		}
	}

	// Map planned_start_at: present empty string = clear; present non-empty = parse; absent = unchanged.
	var plannedStartAt **time.Time
	if in.Body.PlannedStartAt != nil {
		if *in.Body.PlannedStartAt == "" {
			var nilTime *time.Time
			plannedStartAt = &nilTime
		} else {
			tv, err := time.Parse(time.RFC3339, *in.Body.PlannedStartAt)
			if err != nil {
				return nil, platform.BadRequest("task.invalid_planned_start_at", "planned_start_at must be RFC3339")
			}
			tvPtr := &tv
			plannedStartAt = &tvPtr
		}
	}

	// Map estimated_finish_at same way.
	var estimatedFinishAt **time.Time
	if in.Body.EstimatedFinishAt != nil {
		if *in.Body.EstimatedFinishAt == "" {
			var nilTime *time.Time
			estimatedFinishAt = &nilTime
		} else {
			tv, err := time.Parse(time.RFC3339, *in.Body.EstimatedFinishAt)
			if err != nil {
				return nil, platform.BadRequest("task.invalid_estimated_finish_at", "estimated_finish_at must be RFC3339")
			}
			tvPtr := &tv
			estimatedFinishAt = &tvPtr
		}
	}

	updated, err := s.patchTask(ctx, taskID,
		in.Body.Title, in.Body.Description,
		iterationID, plannedStartAt, estimatedFinishAt,
	)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.update",
		ResourceType: "task",
		ResourceID:   updated.ID.String(),
	})

	return &patchTaskOutput{Body: updated}, nil
}

// ─── Take task ────────────────────────────────────────────────────────────────

type takeTaskInput struct {
	ID   string `path:"id"`
	Body struct {
		EstimatedFinishAt string `json:"estimated_finish_at" required:"true"`
	}
}

type takeTaskOutput struct {
	Body *Task
}

func (s *Service) handleTakeTask(ctx context.Context, in *takeTaskInput) (*takeTaskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	estimate, err := time.Parse(time.RFC3339, in.Body.EstimatedFinishAt)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_estimated_finish_at", "estimated_finish_at must be RFC3339")
	}

	updated, err := s.TakeTask(ctx, taskID, p.UserID, estimate)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.take",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	return &takeTaskOutput{Body: updated}, nil
}

// ─── Reassign task ────────────────────────────────────────────────────────────

type reassignTaskInput struct {
	ID   string `path:"id"`
	Body struct {
		AssigneeUserID string `json:"assignee_user_id" required:"true"`
		Comment        string `json:"comment" required:"true" minLength:"1"`
	}
}

type reassignTaskOutput struct {
	Body *Task
}

func (s *Service) handleReassignTask(ctx context.Context, in *reassignTaskInput) (*reassignTaskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	newAssignee, err := uuid.Parse(in.Body.AssigneeUserID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_assignee_id", "invalid assignee_user_id")
	}

	updated, err := s.ReassignTask(ctx, taskID, newAssignee, p.UserID, in.Body.Comment)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.reassign",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	return &reassignTaskOutput{Body: updated}, nil
}

// ─── Cancel task ──────────────────────────────────────────────────────────────

type cancelTaskInput struct {
	ID   string `path:"id"`
	Body struct {
		Reason string `json:"reason" required:"true" minLength:"1"`
	}
}

type cancelTaskOutput struct {
	Body *Task
}

func (s *Service) handleCancelTask(ctx context.Context, in *cancelTaskInput) (*cancelTaskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	updated, err := s.CancelTask(ctx, taskID, p.UserID, in.Body.Reason)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.cancel",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	return &cancelTaskOutput{Body: updated}, nil
}

// ─── Reopen task ──────────────────────────────────────────────────────────────

type reopenTaskInput struct {
	ID   string `path:"id"`
	Body struct {
		TargetStatus      string `json:"target_status" required:"true" enum:"todo,in_progress"`
		EstimatedFinishAt string `json:"estimated_finish_at,omitempty"`
		Comment           string `json:"comment" required:"true" minLength:"1"`
	}
}

type reopenTaskOutput struct {
	Body *Task
}

func (s *Service) handleReopenTask(ctx context.Context, in *reopenTaskInput) (*reopenTaskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	var estimate *time.Time
	if in.Body.EstimatedFinishAt != "" {
		tv, err := time.Parse(time.RFC3339, in.Body.EstimatedFinishAt)
		if err != nil {
			return nil, platform.BadRequest("task.invalid_estimated_finish_at", "estimated_finish_at must be RFC3339")
		}
		estimate = &tv
	}

	updated, err := s.ReopenTask(ctx, taskID, in.Body.TargetStatus, p.UserID, in.Body.Comment, estimate)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.reopen",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	return &reopenTaskOutput{Body: updated}, nil
}

// ─── Delay task ───────────────────────────────────────────────────────────────

type delayTaskInput struct {
	ID   string `path:"id"`
	Body struct {
		NewEstimatedFinishAt string `json:"new_estimated_finish_at" required:"true"`
		Reason               string `json:"reason" required:"true" minLength:"1"`
	}
}

type delayTaskOutput struct {
	Body *Task
}

func (s *Service) handleDelayTask(ctx context.Context, in *delayTaskInput) (*delayTaskOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	newEstimate, err := time.Parse(time.RFC3339, in.Body.NewEstimatedFinishAt)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_new_estimate", "new_estimated_finish_at must be RFC3339")
	}

	updated, err := s.DelayTask(ctx, taskID, p.UserID, newEstimate, in.Body.Reason)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.delay",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	return &delayTaskOutput{Body: updated}, nil
}

// ─── Mark done ────────────────────────────────────────────────────────────────

type markDoneInput struct {
	ID string `path:"id"`
}

type markDoneOutput struct {
	Body *Task
}

func (s *Service) handleMarkDone(ctx context.Context, in *markDoneInput) (*markDoneOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	updated, err := s.MarkDone(ctx, taskID, p.UserID)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.done",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	return &markDoneOutput{Body: updated}, nil
}

// ─── Add reference ────────────────────────────────────────────────────────────

type addReferenceInput struct {
	ID   string `path:"id"`
	Body struct {
		RefType string `json:"ref_type" required:"true" enum:"sample,experiment,page,user,project"`
		RefID   string `json:"ref_id" required:"true"`
		Label   string `json:"label,omitempty"`
	}
}

type addReferenceOutput struct {
	Status int
	Body   *TaskReference
}

func (s *Service) handleAddReference(ctx context.Context, in *addReferenceInput) (*addReferenceOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	refID, err := uuid.Parse(in.Body.RefID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_ref_id", "invalid ref_id")
	}

	ref, err := s.AddReference(ctx, taskID, in.Body.RefType, refID, p.UserID, in.Body.Label)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.reference_add",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	return &addReferenceOutput{Status: http.StatusCreated, Body: ref}, nil
}

// ─── List references ──────────────────────────────────────────────────────────

type listReferencesInput struct {
	ID string `path:"id"`
}

type listReferencesOutput struct {
	Body []*TaskReference
}

func (s *Service) handleListReferences(ctx context.Context, in *listReferencesInput) (*listReferencesOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	refs, err := s.ListReferences(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if refs == nil {
		refs = []*TaskReference{}
	}
	return &listReferencesOutput{Body: refs}, nil
}

// ─── Remove reference ─────────────────────────────────────────────────────────

type removeReferenceInput struct {
	ID      string `path:"id"`
	RefType string `path:"ref_type"`
	RefID   string `path:"ref_id"`
}

type removeReferenceOutput struct {
	Status int
	Body   struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleRemoveReference(ctx context.Context, in *removeReferenceInput) (*removeReferenceOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	refID, err := uuid.Parse(in.RefID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_ref_id", "invalid ref_id")
	}

	if err := s.RemoveReference(ctx, taskID, in.RefType, refID, p.UserID); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.reference_remove",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	out := &removeReferenceOutput{Status: http.StatusOK}
	out.Body.OK = true
	return out, nil
}

// ─── List progress ────────────────────────────────────────────────────────────

type listProgressInput struct {
	ID string `path:"id"`
}

type listProgressOutput struct {
	Body []*TaskProgress
}

func (s *Service) handleListProgress(ctx context.Context, in *listProgressInput) (*listProgressOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	entries, err := s.ListProgress(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if entries == nil {
		entries = []*TaskProgress{}
	}
	return &listProgressOutput{Body: entries}, nil
}

// ─── Add comment ──────────────────────────────────────────────────────────────

type addCommentInput struct {
	ID   string `path:"id"`
	Body struct {
		Body string `json:"body" required:"true" minLength:"1"`
	}
}

type addCommentOutput struct {
	Status int
	Body   *TaskProgress
}

func (s *Service) handleAddComment(ctx context.Context, in *addCommentInput) (*addCommentOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteTasks); err != nil {
		return nil, err
	}

	taskID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("task.invalid_id", "invalid task ID")
	}

	t, err := s.GetTask(ctx, taskID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, t.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	entry, err := s.AddProgressComment(ctx, taskID, p.UserID, in.Body.Body)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "task.comment",
		ResourceType: "task",
		ResourceID:   taskID.String(),
	})

	return &addCommentOutput{Status: http.StatusCreated, Body: entry}, nil
}
