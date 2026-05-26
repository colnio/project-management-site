/**
 * PagesPanel — lists pages for a given parent and provides a "New page" action.
 * Used in ProjectDetailPage (and can be reused in Sample/ExperimentDetailPage).
 */

import { useRouter } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { useCreatePage, pageKeys } from '@/hooks/usePageQueries';
import type { Page } from '@/hooks/usePageQueries';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ParentType = 'project' | 'iteration' | 'sample' | 'experiment';

// ─── Stub API: list pages for a parent ───────────────────────────────────────
// The backend spec doesn't have GET /v1/projects/:id/pages returning a list,
// so we call GET /v1/projects/:id with pages stored in a local stub list.
// We use a client-side store keyed by (parentType, parentId).

const localPageCache: Map<string, Page[]> = new Map();

function usePagesForParent(parentType: ParentType, parentId: string | undefined) {
  const cacheKey = `${parentType}:${parentId}`;
  return useQuery({
    queryKey: pageKeys.parentPages(parentType, parentId ?? ''),
    queryFn: async (): Promise<Page[]> => {
      // Return from local cache (pages are created by useCreatePage and stored locally)
      return localPageCache.get(cacheKey) ?? [];
    },
    enabled: !!parentId,
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PagesPanelProps {
  projectId: string;
  parentType: ParentType;
  parentId: string;
}

export function PagesPanel({ projectId, parentType, parentId }: PagesPanelProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: pages = [], isLoading, isError } = usePagesForParent(parentType, parentId);
  const createPage = useCreatePage();

  const handleNewPage = async () => {
    const result = await createPage.mutateAsync({
      projectId,
      parentType,
      parentId,
      blocks: [],
    });
    // Store in local cache
    const cacheKey = `${parentType}:${parentId}`;
    const existing = localPageCache.get(cacheKey) ?? [];
    localPageCache.set(cacheKey, [...existing, result.page]);
    void qc.invalidateQueries({ queryKey: pageKeys.parentPages(parentType, parentId) });
    // Navigate to editor
    void router.navigate({ to: '/pages/$pageId', params: { pageId: result.page.id } });
  };

  if (isLoading) return <LoadingState message="Loading pages…" />;
  if (isError) return <ErrorState message="Failed to load pages." />;

  return (
    <div>
      <div className="section-h" style={{ marginBottom: 14 }}>
        <h2>Notes / Pages</h2>
        <span className="meta">{pages.length} total</span>
        <div className="right">
          <button
            className="top-btn primary"
            onClick={() => void handleNewPage()}
            disabled={createPage.isPending}
          >
            {createPage.isPending ? 'Creating…' : '+ New page'}
          </button>
        </div>
      </div>

      {pages.length === 0 ? (
        <EmptyState message="No pages yet. Create one to start taking notes." />
      ) : (
        <div className="records">
          {pages.map(p => (
            <PageCard key={p.id} page={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageCard({ page }: { page: Page }) {
  const router = useRouter();
  return (
    <div
      className="rec"
      style={{ cursor: 'pointer' }}
      onClick={() => void router.navigate({ to: '/pages/$pageId', params: { pageId: page.id } })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            background: 'var(--paper-2)',
            padding: '1px 6px',
            borderRadius: 99,
            border: '1px solid var(--line)',
          }}
        >
          {page.parent_type}
        </span>
        {page.current_revision_id && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--muted-2)',
            }}
          >
            rev {page.current_revision_id.slice(0, 6)}…
          </span>
        )}
      </div>
      <div className="name" style={{ fontFamily: 'var(--serif)' }}>
        Page
      </div>
      <div className="foot">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
          {new Date(page.created_at).toLocaleDateString()}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ember)',
          }}
        >
          Open →
        </span>
      </div>
    </div>
  );
}
