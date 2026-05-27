import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import type {
  Workspace,
  Project,
  Sample,
  Experiment,
  Iteration,
  Artifact,
} from '@/api/types';
import type { components } from '@/api/schema.d.ts';

// ─── Extra types (not in re-exports yet) ─────────────────────────────────────

export type LineageGraph = components['schemas']['LineageGraph'];
export type IterationSample = components['schemas']['IterationSample'];
export type ExperimentSample = components['schemas']['ExperimentSample'];
export type Membership = components['schemas']['Membership'];

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const keys = {
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspaces', id] as const,
  workspaceMembers: (id: string) => ['workspaces', id, 'members'] as const,
  projects: (workspaceId: string) => ['workspaces', workspaceId, 'projects'] as const,
  project: (id: string) => ['projects', id] as const,
  projectSamples: (id: string) => ['projects', id, 'samples'] as const,
  projectExperiments: (id: string) => ['projects', id, 'experiments'] as const,
  projectIterations: (id: string) => ['projects', id, 'iterations'] as const,
  projectArtifacts: (id: string) => ['projects', id, 'artifacts'] as const,
  // ── detail keys ──
  iteration: (id: string) => ['iterations', id] as const,
  iterationSamples: (id: string) => ['iterations', id, 'samples'] as const,
  sample: (id: string) => ['samples', id] as const,
  sampleLineage: (id: string) => ['samples', id, 'lineage'] as const,
  experiment: (id: string) => ['experiments', id] as const,
  experimentSamples: (id: string) => ['experiments', id, 'samples'] as const,
};

// ─── Workspaces ──────────────────────────────────────────────────────────────

export function useWorkspaces() {
  return useQuery({
    queryKey: keys.workspaces,
    queryFn: () => api.get<Workspace[] | null>('/v1/workspaces').then(r => r ?? []),
  });
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? keys.workspaceMembers(workspaceId) : ['workspaces', 'none', 'members'],
    queryFn: () =>
      api
        .get<Membership[] | null>(`/v1/workspaces/${workspaceId}/members`)
        .then(r => r ?? []),
    enabled: !!workspaceId,
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

// ─── Iteration detail ────────────────────────────────────────────────────────

export function useIteration(id: string | undefined) {
  return useQuery({
    queryKey: id ? keys.iteration(id) : ['iterations', 'none'],
    queryFn: () => api.get<Iteration>(`/v1/iterations/${id}`),
    enabled: !!id,
  });
}

export function useCreateIteration(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      status?: string;
      start_at?: string;
      end_at?: string;
    }) => api.post<Iteration>(`/v1/projects/${projectId}/iterations`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projectIterations(projectId) }),
  });
}

export function useUpdateIteration(iterationId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title?: string;
      description?: string;
      status?: string;
      start_at?: string;
      end_at?: string;
      position?: number;
    }) => api.patch<Iteration>(`/v1/iterations/${iterationId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.iteration(iterationId) });
      void qc.invalidateQueries({ queryKey: keys.projectIterations(projectId) });
    },
  });
}

export function useDeleteIteration(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (iterationId: string) => api.delete<{ ok: boolean }>(`/v1/iterations/${iterationId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projectIterations(projectId) }),
  });
}

export function useIterationSamples(iterationId: string | undefined) {
  return useQuery({
    queryKey: iterationId ? keys.iterationSamples(iterationId) : ['iterations', 'none', 'samples'],
    queryFn: () =>
      api.get<IterationSample[] | null>(`/v1/iterations/${iterationId}/samples`).then(r => r ?? []),
    enabled: !!iterationId,
  });
}

export function useLinkIterationSample(iterationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sample_id: string; role?: string; note?: string }) =>
      api.post<{ ok: boolean }>(`/v1/iterations/${iterationId}/samples`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.iterationSamples(iterationId) }),
  });
}

export function useUnlinkIterationSample(iterationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sampleId: string) =>
      api.delete<{ ok: boolean }>(`/v1/iterations/${iterationId}/samples/${sampleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.iterationSamples(iterationId) }),
  });
}

// ─── Sample detail ────────────────────────────────────────────────────────────

export function useSample(id: string | undefined) {
  return useQuery({
    queryKey: id ? keys.sample(id) : ['samples', 'none'],
    queryFn: () => api.get<Sample>(`/v1/samples/${id}`),
    enabled: !!id,
  });
}

export function useCreateSample(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      identifier: string;
      name?: string;
      description?: string;
      kind?: string;
      status?: string;
      properties?: Record<string, unknown>;
    }) => api.post<Sample>(`/v1/projects/${projectId}/samples`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projectSamples(projectId) }),
  });
}

export function useUpdateSample(sampleId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      identifier?: string;
      name?: string;
      description?: string;
      kind?: string;
      status?: string;
      properties?: Record<string, unknown>;
    }) => api.patch<Sample>(`/v1/samples/${sampleId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.sample(sampleId) });
      void qc.invalidateQueries({ queryKey: keys.projectSamples(projectId) });
    },
  });
}

export function useSampleLineage(sampleId: string | undefined) {
  return useQuery({
    queryKey: sampleId ? keys.sampleLineage(sampleId) : ['samples', 'none', 'lineage'],
    queryFn: () => api.get<LineageGraph>(`/v1/samples/${sampleId}/lineage`),
    enabled: !!sampleId,
  });
}

export function useAddSampleRelation(sampleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { child_sample_id: string; relation_type: string; notes?: string }) =>
      api.post<{ ok: boolean }>(`/v1/samples/${sampleId}/relations`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sampleLineage(sampleId) }),
  });
}

// ─── Experiment detail ────────────────────────────────────────────────────────

export function useExperiment(id: string | undefined) {
  return useQuery({
    queryKey: id ? keys.experiment(id) : ['experiments', 'none'],
    queryFn: () => api.get<Experiment>(`/v1/experiments/${id}`),
    enabled: !!id,
  });
}

export function useCreateExperiment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      method?: string;
      iteration_id?: string;
      status?: string;
      parameters?: Record<string, unknown>;
      result_summary?: string;
      performed_at?: string;
    }) => api.post<Experiment>(`/v1/projects/${projectId}/experiments`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projectExperiments(projectId) }),
  });
}

export function useUpdateExperiment(experimentId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      method?: string;
      iteration_id?: string;
      status?: string;
      parameters?: Record<string, unknown>;
      result_summary?: string;
      performed_at?: string;
    }) => api.patch<Experiment>(`/v1/experiments/${experimentId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.experiment(experimentId) });
      void qc.invalidateQueries({ queryKey: keys.projectExperiments(projectId) });
    },
  });
}

export function useExperimentSamples(experimentId: string | undefined) {
  return useQuery({
    queryKey: experimentId ? keys.experimentSamples(experimentId) : ['experiments', 'none', 'samples'],
    queryFn: () =>
      api.get<ExperimentSample[] | null>(`/v1/experiments/${experimentId}/samples`).then(r => r ?? []),
    enabled: !!experimentId,
  });
}

export function useLinkExperimentSample(experimentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sample_id: string; role?: string; note?: string }) =>
      api.post<{ ok: boolean }>(`/v1/experiments/${experimentId}/samples`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.experimentSamples(experimentId) }),
  });
}

export function useUnlinkExperimentSample(experimentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sampleId: string) =>
      api.delete<{ ok: boolean }>(`/v1/experiments/${experimentId}/samples/${sampleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.experimentSamples(experimentId) }),
  });
}

// ─── Current Workspace ────────────────────────────────────────────────────────

const LS_KEY = 'currentWorkspaceId';

/**
 * Returns the currently-active workspace, persisted in localStorage.
 * Falls back to the first workspace from the API if no selection is stored.
 */
export function useCurrentWorkspace() {
  const { data: workspaces = [] } = useWorkspaces();

  const [workspaceId, setWorkspaceIdState] = useState<string | undefined>(() => {
    return localStorage.getItem(LS_KEY) ?? undefined;
  });

  // When workspaces load, ensure the stored id is still valid; fall back to first.
  useEffect(() => {
    if (workspaces.length === 0) return;
    const stored = localStorage.getItem(LS_KEY);
    if (stored && workspaces.some(w => w.id === stored)) {
      setWorkspaceIdState(stored);
    } else {
      const first = workspaces[0].id;
      localStorage.setItem(LS_KEY, first);
      setWorkspaceIdState(first);
    }
  }, [workspaces]);

  const setWorkspaceId = (id: string) => {
    localStorage.setItem(LS_KEY, id);
    setWorkspaceIdState(id);
  };

  return { workspaceId, workspaces, setWorkspaceId };
}
