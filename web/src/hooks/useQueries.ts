import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type {
  Workspace,
  Project,
  Sample,
  Experiment,
  Iteration,
  Artifact,
} from '@/api/types';

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const keys = {
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspaces', id] as const,
  projects: (workspaceId: string) => ['workspaces', workspaceId, 'projects'] as const,
  project: (id: string) => ['projects', id] as const,
  projectSamples: (id: string) => ['projects', id, 'samples'] as const,
  projectExperiments: (id: string) => ['projects', id, 'experiments'] as const,
  projectIterations: (id: string) => ['projects', id, 'iterations'] as const,
  projectArtifacts: (id: string) => ['projects', id, 'artifacts'] as const,
};

// ─── Workspaces ──────────────────────────────────────────────────────────────

export function useWorkspaces() {
  return useQuery({
    queryKey: keys.workspaces,
    queryFn: () => api.get<Workspace[] | null>('/v1/workspaces').then(r => r ?? []),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<Workspace>('/v1/workspaces', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

// ─── Projects ────────────────────────────────────────────────────────────────

export function useProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? keys.projects(workspaceId) : ['projects', 'none'],
    queryFn: () =>
      api
        .get<Project[] | null>(`/v1/workspaces/${workspaceId}/projects`)
        .then(r => r ?? []),
    enabled: !!workspaceId,
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? keys.project(projectId) : ['projects', 'none'],
    queryFn: () => api.get<Project>(`/v1/projects/${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateProject(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; visibility?: string }) =>
      api.post<Project>(`/v1/workspaces/${workspaceId}/projects`, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: keys.projects(workspaceId) }),
  });
}

// ─── Project sub-resources ───────────────────────────────────────────────────

export function useProjectSamples(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? keys.projectSamples(projectId) : ['projects', 'none', 'samples'],
    queryFn: () =>
      api.get<Sample[] | null>(`/v1/projects/${projectId}/samples`).then(r => r ?? []),
    enabled: !!projectId,
  });
}

export function useProjectExperiments(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? keys.projectExperiments(projectId) : ['projects', 'none', 'experiments'],
    queryFn: () =>
      api
        .get<Experiment[] | null>(`/v1/projects/${projectId}/experiments`)
        .then(r => r ?? []),
    enabled: !!projectId,
  });
}

export function useProjectIterations(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? keys.projectIterations(projectId) : ['projects', 'none', 'iterations'],
    queryFn: () =>
      api
        .get<Iteration[] | null>(`/v1/projects/${projectId}/iterations`)
        .then(r => r ?? []),
    enabled: !!projectId,
  });
}

export function useProjectArtifacts(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? keys.projectArtifacts(projectId) : ['projects', 'none', 'artifacts'],
    queryFn: () =>
      api
        .get<Artifact[] | null>(`/v1/projects/${projectId}/artifacts`)
        .then(r => r ?? []),
    enabled: !!projectId,
  });
}
