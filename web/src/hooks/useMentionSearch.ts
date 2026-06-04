/**
 * useMentionSearch — cross-workspace @-mention search hooks + mutation.
 *
 * searchMentions  — plain async function, suitable for BlockNote getItems callbacks.
 * useMentionSearch — debounced useQuery wrapper for component use.
 * useCreateMention — mutation for POST /v1/mentions.
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: 'people' | 'project' | 'sample' | 'experiment';
  id: string;
  label: string;
  sublabel: string;
  project_id?: string;
  workspace_id?: string;
  workspace_name?: string;
  email?: string;
  kind?: string;
  status?: string;
  method?: string;
  /** 0 = this project, 1 = this workspace, 2 = elsewhere */
  tier: number;
}

export interface CreateMentionBody {
  mentioned_user_id: string;
  source_type: 'task' | 'page';
  source_id: string;
  project_id?: string;
  workspace_id?: string;
  link?: string;
  snippet?: string;
}

// ─── Plain async helper ────────────────────────────────────────────────────────

export async function searchMentions(
  query: string,
  opts?: { projectId?: string; types?: string[]; limit?: number }
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({ q });
  if (opts?.projectId) params.set('project_id', opts.projectId);
  if (opts?.types?.length) params.set('types', opts.types.join(','));
  if (opts?.limit != null) params.set('limit', String(opts.limit));

  const result = await api.get<SearchResult[] | null>(`/v1/search?${params.toString()}`);
  return result ?? [];
}

// ─── Debounced hook ────────────────────────────────────────────────────────────

export function useMentionSearch(
  query: string,
  opts?: { projectId?: string; types?: string[]; limit?: number }
) {
  // Debounce the query by ~200 ms so rapid keystrokes don't fire a request per
  // character. We track the debounced value in state and update it with a timer.
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return useQuery({
    queryKey: ['mention-search', debouncedQuery, opts?.projectId, opts?.types, opts?.limit],
    queryFn: () => searchMentions(debouncedQuery, opts),
    enabled: debouncedQuery.trim().length >= 1,
    placeholderData: (prev) => prev,
  });
}

// ─── Mutation ──────────────────────────────────────────────────────────────────

export function useCreateMention() {
  return useMutation({
    mutationFn: (body: CreateMentionBody) =>
      api.post<{ ok: boolean }>('/v1/mentions', body),
  });
}
