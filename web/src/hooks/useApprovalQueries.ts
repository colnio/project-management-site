/**
 * Approval request hooks: generate AI risk review, create/list approval requests, decide.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApprovalRecipient {
  user_id: string;
  email: string;
  display_name: string;
}

export interface ApprovalRequest {
  id: string;
  project_id: string;
  iteration_id?: string;
  created_by: string;
  description: string;
  ai_review: string;
  status: 'pending' | 'approved' | 'rejected';
  recipients: ApprovalRecipient[];
  decided_by?: string;
  decided_at?: string;
  created_at: string;
  updated_at: string;
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const approvalKeys = {
  projectApprovals: (projectId: string) =>
    ['projects', projectId, 'approval-requests'] as const,
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** POST /v1/projects/{id}/ai/risk-review — returns { review: string } */
export function useGenerateRiskReview(projectId: string) {
  return useMutation({
    mutationFn: ({ iteration_id }: { iteration_id?: string }) =>
      api.post<{ review: string }>(`/v1/projects/${projectId}/ai/risk-review`, {
        ...(iteration_id ? { iteration_id } : {}),
      }),
  });
}

/** POST /v1/projects/{id}/approval-requests */
export function useCreateApprovalRequest(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      iteration_id?: string;
      description: string;
      ai_review: string;
      recipient_user_ids: string[];
    }) =>
      api.post<ApprovalRequest>(`/v1/projects/${projectId}/approval-requests`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: approvalKeys.projectApprovals(projectId) });
      // Inbox is workspace-scoped; invalidate all workspace inbox queries.
      void qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

/** GET /v1/projects/{id}/approval-requests */
export function useProjectApprovalRequests(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId
      ? approvalKeys.projectApprovals(projectId)
      : ['projects', 'none', 'approval-requests'],
    queryFn: () =>
      api
        .get<{ items: ApprovalRequest[] } | null>(
          `/v1/projects/${projectId}/approval-requests`,
        )
        .then(r => r?.items ?? []),
    enabled: !!projectId,
  });
}

/** POST /v1/approval-requests/{id}/decide */
export function useDecideApprovalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, approve }: { requestId: string; approve: boolean }) =>
      api.post<{ status: string }>(`/v1/approval-requests/${requestId}/decide`, {
        approve,
      }),
    onSuccess: () => {
      // Invalidate all approval request lists and inbox queries.
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
