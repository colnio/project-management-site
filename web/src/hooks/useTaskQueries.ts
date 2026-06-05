/**
 * Task tracking hooks: project tasks, iteration tasks, CRUD + action mutations.
 * Mirrors useRiskQueries.ts conventions.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  project_id: string;
  iteration_id?: string;
  seq: number;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
  assignee_user_id?: string;
  actual_executor_id?: string;
  planned_start_at?: string;
  estimated_finish_at?: string;
  started_at?: string;
  finished_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskReference {
  id: string;
  task_id: string;
  ref_type: 'sample' | 'experiment' | 'page' | 'user' | 'project';
  ref_id: string;
  label: string;
  created_by: string;
  created_at: string;
}

export interface TaskProgress {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  event_type:
    | 'created'
    | 'status_change'
    | 'reassign'
    | 'reopen'
    | 'delay'
    | 'comment'
    | 'reference_added'
    | 'reference_removed';
  from_status?: string;
  to_status?: string;
  from_assignee?: string;
  to_assignee?: string;
  reason?: string;
  created_at: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export function isDelayed(t: Task): boolean {
  if (!t.estimated_finish_at) return false;
  if (t.status === 'done' || t.status === 'cancelled') return false;
  return new Date(t.estimated_finish_at) < new Date();
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export interface TaskFilters {
  status?: string;
  assignee_user_id?: string;
  iteration_id?: string;
  q?: string;
}

export const taskKeys = {
  projectTasks: (projectId: string, filters?: TaskFilters) =>
    ['projects', projectId, 'tasks', filters ?? {}] as const,
  iterationTasks: (iterationId: string) => ['iterations', iterationId, 'tasks'] as const,
  task: (id: string) => ['tasks', id] as const,
  references: (taskId: string) => ['tasks', taskId, 'references'] as const,
  progress: (taskId: string) => ['tasks', taskId, 'progress'] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useProjectTasks(projectId?: string, filters?: TaskFilters) {
  return useQuery({
    queryKey: projectId
      ? taskKeys.projectTasks(projectId, filters)
      : ['projects', 'none', 'tasks', {}],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.assignee_user_id) params.set('assignee_user_id', filters.assignee_user_id);
      if (filters?.iteration_id) params.set('iteration_id', filters.iteration_id);
      if (filters?.q) params.set('q', filters.q);
      const qs = params.toString();
      return api
        .get<Task[] | null>(`/v1/projects/${projectId}/tasks${qs ? `?${qs}` : ''}`)
        .then(r => r ?? []);
    },
    enabled: !!projectId,
  });
}

export function useIterationTasks(iterationId?: string) {
  return useQuery({
    queryKey: iterationId
      ? taskKeys.iterationTasks(iterationId)
      : ['iterations', 'none', 'tasks'],
    queryFn: () =>
      api.get<Task[] | null>(`/v1/iterations/${iterationId}/tasks`).then(r => r ?? []),
    enabled: !!iterationId,
  });
}

export function useTask(taskId?: string) {
  return useQuery({
    queryKey: taskId ? taskKeys.task(taskId) : ['tasks', 'none'],
    queryFn: () => api.get<Task>(`/v1/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useTaskReferences(taskId?: string) {
  return useQuery({
    queryKey: taskId ? taskKeys.references(taskId) : ['tasks', 'none', 'references'],
    queryFn: () =>
      api.get<TaskReference[] | null>(`/v1/tasks/${taskId}/references`).then(r => r ?? []),
    enabled: !!taskId,
  });
}

export function useTaskProgress(taskId?: string) {
  return useQuery({
    queryKey: taskId ? taskKeys.progress(taskId) : ['tasks', 'none', 'progress'],
    queryFn: () =>
      api.get<TaskProgress[] | null>(`/v1/tasks/${taskId}/progress`).then(r => r ?? []),
    enabled: !!taskId,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Invalidate all 'tasks' list queries by predicate, plus specific keys. */
function invalidateTasks(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  iterationId?: string,
  taskId?: string,
) {
  void qc.invalidateQueries({
    predicate: q => {
      const k = q.queryKey;
      const last = Array.isArray(k) ? k[k.length - 1] : undefined;
      // last element is 'tasks' for iterationTasks keys, or the filters object for projectTasks
      return last === 'tasks' || (typeof last === 'object' && last !== null && k[2] === 'tasks');
    },
  });
  void qc.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
  if (iterationId) {
    void qc.invalidateQueries({ queryKey: taskKeys.iterationTasks(iterationId) });
  }
  if (taskId) {
    void qc.invalidateQueries({ queryKey: taskKeys.task(taskId) });
  }
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      iteration_id?: string;
      assignee_user_id?: string;
      actual_executor_id?: string;
      planned_start_at?: string;
      estimated_finish_at?: string;
      started_at?: string;
      finished_at?: string;
    }) => api.post<Task>(`/v1/projects/${projectId}/tasks`, body),
    onSuccess: (task) => {
      invalidateTasks(qc, projectId, task.iteration_id);
    },
  });
}

export function useUpdateTask(taskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title?: string;
      description?: string;
      iteration_id?: string;
      planned_start_at?: string;
      estimated_finish_at?: string;
    }) => api.patch<Task>(`/v1/tasks/${taskId}`, body),
    onSuccess: (task) => {
      invalidateTasks(qc, projectId, task.iteration_id, taskId);
    },
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.delete<{ ok: boolean }>(`/v1/tasks/${taskId}`),
    onSuccess: () => {
      invalidateTasks(qc, projectId);
    },
  });
}

export function useTakeTask(taskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { estimated_finish_at: string }) =>
      api.post<Task>(`/v1/tasks/${taskId}/take`, body),
    onSuccess: (task) => {
      invalidateTasks(qc, projectId, task.iteration_id, taskId);
    },
  });
}

export function useReassignTask(taskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { assignee_user_id: string; comment: string }) =>
      api.post<Task>(`/v1/tasks/${taskId}/reassign`, body),
    onSuccess: (task) => {
      invalidateTasks(qc, projectId, task.iteration_id, taskId);
    },
  });
}

export function useCancelTask(taskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason: string }) =>
      api.post<Task>(`/v1/tasks/${taskId}/cancel`, body),
    onSuccess: (task) => {
      invalidateTasks(qc, projectId, task.iteration_id, taskId);
    },
  });
}

export function useReopenTask(taskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      target_status: 'todo' | 'in_progress';
      estimated_finish_at?: string;
      comment: string;
    }) => api.post<Task>(`/v1/tasks/${taskId}/reopen`, body),
    onSuccess: (task) => {
      invalidateTasks(qc, projectId, task.iteration_id, taskId);
    },
  });
}

export function useDelayTask(taskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { new_estimated_finish_at: string; reason: string }) =>
      api.post<Task>(`/v1/tasks/${taskId}/delay`, body),
    onSuccess: (task) => {
      invalidateTasks(qc, projectId, task.iteration_id, taskId);
    },
  });
}

export function useMarkDone(taskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Task>(`/v1/tasks/${taskId}/done`),
    onSuccess: (task) => {
      invalidateTasks(qc, projectId, task.iteration_id, taskId);
    },
  });
}

export function useAddReference(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      ref_type: 'sample' | 'experiment' | 'page' | 'user' | 'project';
      ref_id: string;
      label: string;
    }) => api.post<TaskReference>(`/v1/tasks/${taskId}/references`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.references(taskId) });
    },
  });
}

export function useRemoveReference(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ref_type,
      ref_id,
    }: {
      ref_type: 'sample' | 'experiment' | 'page' | 'user' | 'project';
      ref_id: string;
    }) => api.delete<{ ok: boolean }>(`/v1/tasks/${taskId}/references/${ref_type}/${ref_id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.references(taskId) });
    },
  });
}

export function useAddTaskComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string }) =>
      api.post<TaskProgress>(`/v1/tasks/${taskId}/comments`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.progress(taskId) });
    },
  });
}
