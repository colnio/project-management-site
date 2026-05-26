/**
 * Queries and mutations for pages, revisions, and presence.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getAccessToken } from '@/api/client';
import type { components } from '@/api/schema.d.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Page = components['schemas']['Page'];
export type Revision = components['schemas']['Revision'];
export type PresenceEntry = components['schemas']['PresenceEntry'];
export type DiffLine = components['schemas']['DiffLine'];

export interface GetPageResponse {
  id: string;
  project_id: string;
  parent_type: string;
  parent_id: string;
  blocks: unknown;
  markdown_export: string;
  current_revision_id?: string;
  /** ETag from the response header — merged in by fetch helper */
  _etag?: string;
}

export interface UpdatePageResponse {
  page: Page;
  revision: Revision;
  blocks: unknown;
  /** ETag from the response header */
  _etag?: string;
}

export interface CreatePageResponse {
  page: Page;
  blocks: unknown;
  _etag?: string;
}

export interface RevisionFull {
  revision: Revision;
  blocks: unknown;
}

// ─── Keys ────────────────────────────────────────────────────────────────────

export const pageKeys = {
  page: (id: string) => ['pages', id] as const,
  revisions: (pageId: string) => ['pages', pageId, 'revisions'] as const,
  revision: (revId: string) => ['revisions', revId] as const,
  presence: (pageId: string) => ['pages', pageId, 'presence'] as const,
  /** List of pages for a given parent (project/sample/experiment/iteration) */
  parentPages: (parentType: string, parentId: string) =>
    ['pages', 'parent', parentType, parentId] as const,
};

// ─── Raw fetch helpers that expose ETag ──────────────────────────────────────

async function fetchPage(pageId: string): Promise<GetPageResponse> {
  const resp = await fetch(`/v1/pages/${pageId}`, {
    headers: buildAuthHeaders(),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch page: ${resp.status}`);
  }
  const data = (await resp.json()) as GetPageResponse;
  data._etag = resp.headers.get('ETag') ?? undefined;
  return data;
}

async function putPage(
  pageId: string,
  etag: string,
  body: { blocks: unknown; source: 'human' | 'auto_save' }
): Promise<{ data: UpdatePageResponse; etag: string; status: number }> {
  const resp = await fetch(`/v1/pages/${pageId}`, {
    method: 'PUT',
    headers: {
      ...buildAuthHeaders(),
      'Content-Type': 'application/json',
      'If-Match': etag,
    },
    body: JSON.stringify(body),
  });
  const newEtag = resp.headers.get('ETag') ?? etag;
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    return { data: errBody as UpdatePageResponse, etag: newEtag, status: resp.status };
  }
  const data = (await resp.json()) as UpdatePageResponse;
  data._etag = newEtag;
  return { data, etag: newEtag, status: resp.status };
}

async function postPage(
  projectId: string,
  body: { parent_type: string; parent_id: string; blocks: unknown }
): Promise<CreatePageResponse> {
  const resp = await fetch(`/v1/projects/${projectId}/pages`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Failed to create page: ${resp.status}`);
  }
  const data = (await resp.json()) as CreatePageResponse;
  data._etag = resp.headers.get('ETag') ?? undefined;
  return data;
}

function buildAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ─── Query hooks ─────────────────────────────────────────────────────────────

export function usePage(pageId: string | undefined) {
  return useQuery({
    queryKey: pageId ? pageKeys.page(pageId) : ['pages', 'none'],
    queryFn: () => fetchPage(pageId!),
    enabled: !!pageId,
  });
}

export function useRevisions(pageId: string | undefined) {
  return useQuery({
    queryKey: pageId ? pageKeys.revisions(pageId) : ['pages', 'none', 'revisions'],
    queryFn: () =>
      apiFetch<{ revisions: Revision[] | null; next_cursor?: string }>(
        `/v1/pages/${pageId}/revisions`
      ).then(r => r.revisions ?? []),
    enabled: !!pageId,
  });
}

export function useRevision(revisionId: string | undefined) {
  return useQuery({
    queryKey: revisionId ? pageKeys.revision(revisionId) : ['revisions', 'none'],
    queryFn: () => apiFetch<RevisionFull>(`/v1/revisions/${revisionId}`),
    enabled: !!revisionId,
  });
}

export function useRevisionDiff(revisionId: string | undefined, againstId: string | undefined) {
  return useQuery({
    queryKey: revisionId && againstId ? ['revisions', revisionId, 'diff', againstId] : ['revisions', 'none', 'diff'],
    queryFn: () =>
      apiFetch<{ lines: DiffLine[] | null }>(
        `/v1/revisions/${revisionId}/diff?against=${againstId}`
      ).then(r => r.lines ?? []),
    enabled: !!revisionId && !!againstId,
  });
}

export function usePresence(pageId: string | undefined) {
  return useQuery({
    queryKey: pageId ? pageKeys.presence(pageId) : ['pages', 'none', 'presence'],
    queryFn: () =>
      apiFetch<{ present: PresenceEntry[] | null }>(`/v1/pages/${pageId}/presence`).then(
        r => r.present ?? []
      ),
    enabled: !!pageId,
    refetchInterval: 15000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      projectId: string;
      parentType: string;
      parentId: string;
      blocks?: unknown;
    }) =>
      postPage(args.projectId, {
        parent_type: args.parentType,
        parent_id: args.parentId,
        blocks: args.blocks ?? [],
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: pageKeys.parentPages(vars.parentType, vars.parentId),
      });
    },
  });
}

export function useRestorePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, revisionId }: { pageId: string; revisionId: string }) =>
      apiFetch<{ page: Page; revision: Revision }>(`/v1/pages/${pageId}/restore`, {
        method: 'POST',
        body: JSON.stringify({ revision_id: revisionId }),
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: pageKeys.page(vars.pageId) });
      void qc.invalidateQueries({ queryKey: pageKeys.revisions(vars.pageId) });
    },
  });
}

export function useHeartbeat() {
  return useMutation({
    mutationFn: ({ pageId, clientId }: { pageId: string; clientId: string }) =>
      apiFetch<{ ok: boolean }>(`/v1/pages/${pageId}/presence/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({ client_id: clientId }),
      }),
  });
}

// ─── Low-level PUT (used directly by editor, not via useMutation) ─────────────

export { putPage, fetchPage };
