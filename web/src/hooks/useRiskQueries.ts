/**
 * Risk Register hooks: project risks, iteration risks, CRUD mutations.
 * useRunWorkflow is re-exported from useAIQueries for convenience.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Risk {
  id: string;
  project_id: string;
  iteration_id?: string;
  seq: number;
  title: string;
  likelihood: 'high' | 'med' | 'low';
  impact_headline: string;
  impact_description: string;
  mitigation: string;
  plan_b: string;
  status: 'open' | 'mitigated' | 'accepted' | 'closed';
  flagged_for_pi_review: boolean;
  source: 'human' | 'ai';
  workflow_run_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const riskKeys = {
  projectRisks: (projectId: string) => ['projects', projectId, 'risks'] as const,
  iterationRisks: (iterationId: string) => ['iterations', iterationId, 'risks'] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useProjectRisks(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? riskKeys.projectRisks(projectId) : ['projects', 'none', 'risks'],
    queryFn: () =>
      api.get<Risk[] | null>(`/v1/projects/${projectId}/risks`).then(r => r ?? []),
    enabled: !!projectId,
  });
}

export function useIterationRisks(iterationId: string | undefined) {
  return useQuery({
    queryKey: iterationId ? riskKeys.iterationRisks(iterationId) : ['iterations', 'none', 'risks'],
    queryFn: () =>
      api.get<Risk[] | null>(`/v1/iterations/${iterationId}/risks`).then(r => r ?? []),
    enabled: !!iterationId,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateRisk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      likelihood?: 'high' | 'med' | 'low';
      impact_headline?: string;
      impact_description?: string;
      mitigation?: string;
      plan_b?: string;
      iteration_id?: string;
    }) => api.post<Risk>(`/v1/projects/${projectId}/risks`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: riskKeys.projectRisks(projectId) }),
  });
}

export function useUpdateRisk(riskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title?: string;
      likelihood?: 'high' | 'med' | 'low';
      impact_headline?: string;
      impact_description?: string;
      mitigation?: string;
      plan_b?: string;
      status?: 'open' | 'mitigated' | 'accepted' | 'closed';
      flagged_for_pi_review?: boolean;
    }) => api.patch<Risk>(`/v1/risks/${riskId}`, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: riskKeys.projectRisks(projectId) }),
  });
}

export function useDeleteRisk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (riskId: string) => api.delete<{ ok: boolean }>(`/v1/risks/${riskId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: riskKeys.projectRisks(projectId) }),
  });
}

export function useSetRiskPIReview(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ riskId, flagged }: { riskId: string; flagged: boolean }) =>
      api.post<Risk>(`/v1/risks/${riskId}/pi-review`, { flagged }),
    onSuccess: () => qc.invalidateQueries({ queryKey: riskKeys.projectRisks(projectId) }),
  });
}

// Re-export useRunWorkflow for convenience
export { useRunWorkflow } from '@/hooks/useAIQueries';
