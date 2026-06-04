/**
 * Activity feed hooks: workspace-level activity stream with infinite scroll.
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type: 'project' | 'iteration' | 'sample' | 'experiment' | 'page' | 'artifact' | 'risk' | 'task';
  action: string;
  entity_id: string;
  project_id: string;
  title: string;
  actor_id?: string;
  actor_name: string;
  from_status?: string;
  to_status?: string;
  reason?: string;
  created_at: string;
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const activityKeys = {
  workspaceActivity: (wsId: string) => ['workspaces', wsId, 'activity'] as const,
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useWorkspaceActivity(workspaceId?: string) {
  const query = useInfiniteQuery({
    queryKey: activityKeys.workspaceActivity(workspaceId ?? 'none'),
    queryFn: ({ pageParam }: { pageParam: string }) =>
      api
        .get<ActivityItem[] | null>(
          `/v1/workspaces/${workspaceId}/activity?limit=40${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
        )
        .then(r => r ?? []),
    initialPageParam: '' as string,
    getNextPageParam: (lastPage: ActivityItem[]) =>
      lastPage.length === 40 ? lastPage[lastPage.length - 1].created_at : undefined,
    enabled: !!workspaceId,
  });

  const items: ActivityItem[] = query.data?.pages.flat() ?? [];

  return { ...query, items };
}
