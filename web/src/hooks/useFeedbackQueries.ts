/**
 * Feedback hooks.
 * Endpoints:
 *   POST /v1/feedback                         (any authenticated user)
 *   GET  /v1/admin/feedback                   (admin/PI)
 *   POST /v1/admin/feedback/{id}/acknowledge  (admin/PI)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { FeedbackEntry } from '@/api/types';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const feedbackKeys = {
  list: (includeAcknowledged: boolean) =>
    ['admin', 'feedback', { includeAcknowledged }] as const,
};

// ─── Submit feedback ─────────────────────────────────────────────────────────

export interface SubmitFeedbackPayload {
  category: 'bug' | 'idea' | 'other';
  message: string;
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (body: SubmitFeedbackPayload) =>
      api.post<{ ok: boolean }>('/v1/feedback', body),
  });
}

// ─── List feedback (admin) ───────────────────────────────────────────────────

interface FeedbackListResponse {
  items?: FeedbackEntry[];
}

export function useFeedbackList(includeAcknowledged: boolean) {
  return useQuery({
    queryKey: feedbackKeys.list(includeAcknowledged),
    queryFn: async (): Promise<FeedbackEntry[]> => {
      const res = await api.get<FeedbackListResponse | FeedbackEntry[]>(
        `/v1/admin/feedback?include_acknowledged=${includeAcknowledged}`,
      );
      if (Array.isArray(res)) return res;
      return (res as FeedbackListResponse).items ?? [];
    },
  });
}

// ─── Acknowledge feedback (admin) ────────────────────────────────────────────

export function useAcknowledgeFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: boolean }>(`/v1/admin/feedback/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  });
}
