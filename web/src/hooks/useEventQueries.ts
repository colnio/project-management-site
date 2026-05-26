import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CalendarEvent, CreateEventBody, UpdateEventBody } from '@/api/eventTypes';
import type { Workspace, Project } from '@/api/types';
import { keys as qkeys } from './useQueries';

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const eventKeys = {
  projectEvents: (projectId: string, from: string, to: string) =>
    ['projects', projectId, 'events', from, to] as const,
  event: (id: string) => ['events', id] as const,
};

// ─── Per-project events ───────────────────────────────────────────────────────

export function useProjectEvents(
  projectId: string | undefined,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: projectId ? eventKeys.projectEvents(projectId, from, to) : ['events', 'none'],
    queryFn: () =>
      api
        .get<CalendarEvent[] | null>(
          `/v1/projects/${projectId}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        )
        .then(r => r ?? []),
    enabled: !!projectId && !!from && !!to,
  });
}

// ─── Unified events across all workspaces/projects ───────────────────────────
// Fetches events for every project in every workspace and merges client-side.

export function useAllProjectsEvents(
  workspaces: Workspace[],
  projectsByWorkspace: Map<string, Project[]>,
  from: string,
  to: string,
) {
  // Flatten all projects across all workspaces
  const allProjects: Project[] = [];
  for (const ws of workspaces) {
    const projects = projectsByWorkspace.get(ws.id) ?? [];
    for (const p of projects) {
      allProjects.push(p);
    }
  }

  const results = useQueries({
    queries: allProjects.map(p => ({
      queryKey: eventKeys.projectEvents(p.id, from, to),
      queryFn: () =>
        api
          .get<CalendarEvent[] | null>(
            `/v1/projects/${p.id}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
          )
          .then(r => r ?? []),
      enabled: !!from && !!to,
    })),
  });

  const isLoading = results.some(r => r.isLoading);
  const isError = results.some(r => r.isError);
  const allEvents: CalendarEvent[] = [];
  for (let i = 0; i < results.length; i++) {
    const data = results[i].data ?? [];
    for (const ev of data) {
      allEvents.push(ev);
    }
  }

  return { data: allEvents, isLoading, isError, allProjects };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateEvent(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventBody) =>
      api.post<CalendarEvent>(`/v1/projects/${projectId}/events`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'events'] });
    },
  });
}

export function useUpdateEvent(eventId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateEventBody) =>
      api.patch<CalendarEvent>(`/v1/events/${eventId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: eventKeys.event(eventId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'events'] });
    },
  });
}

export function useDeleteEvent(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      api.delete<{ ok: boolean }>(`/v1/events/${eventId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'events'] });
    },
  });
}

// ─── Unified iterations across all projects (for timeline) ───────────────────

export function useAllProjectsIterations(
  workspaces: Workspace[],
  projectsByWorkspace: Map<string, Project[]>,
) {
  const allProjects: Project[] = [];
  for (const ws of workspaces) {
    const projects = projectsByWorkspace.get(ws.id) ?? [];
    for (const p of projects) {
      allProjects.push(p);
    }
  }

  const results = useQueries({
    queries: allProjects.map(p => ({
      queryKey: qkeys.projectIterations(p.id),
      queryFn: () =>
        api
          .get<import('@/api/types').Iteration[] | null>(`/v1/projects/${p.id}/iterations`)
          .then(r => r ?? []),
    })),
  });

  const isLoading = results.some(r => r.isLoading);
  const isError = results.some(r => r.isError);

  return { results, isLoading, isError, allProjects };
}
