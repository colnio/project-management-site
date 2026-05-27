/**
 * PagesPanel — lists pages for a given parent and provides a "New page" action.
 * Used in ProjectDetailPage (and can be reused in Sample/ExperimentDetailPage).
 *
 * Uses useProjectPages (real API) instead of the old local-cache stub.
 * Newly created pages appear after query invalidation via useCreatePage's
 * onSuccess handler (which invalidates parentPages) plus an explicit projectPages
 * invalidation below.
 */

import { useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { useProjectPages, useCreatePage, pageKeys } from '@/hooks/usePageQueries';
import type { PageListItem } from '@/hooks/usePageQueries';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ParentType = 'project' | 'iteration' | 'sample' | 'experiment';

// ─── Component ────────────────────────────────────────────────────────────────

interface PagesPanelProps {
  projectId: string;
  parentType: ParentType;
  parentId: string;
}

export function PagesPanel({ projectId, parentType, parentId }: PagesPanelProps) {
  const router = useRouter();
  const qc = useQueryClient();

  // Use the real project pages endpoint, filtered by parent if needed.
  // useProjectPages fetches GET /v1/projects/{id}/pages which returns all pages
  // for the project. We filter client-side by parentType + parentId.
  const { data: allPages = [], isLoading, isError } = useProjectPages(projectId);
  const pages = allPages.filter(
    p => p.parent_type === parentType && p.parent_id === parentId
  );

  const createPage = useCreatePage();

  const handleNewPage = async () => {
    const result = await createPage.mutateAsync({
      projectId,
      parentType,
      parentId,
      blocks: [],
    });
    // Invalidate project-level pages query so the list refreshes.
    void qc.invalidateQueries({ queryKey: pageKeys.projectPages(projectId) });
    // Navigate to the new page's editor.
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

function PageCard({ page }: { page: PageListItem }) {
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
        {page.title || 'Untitled'}
      </div>
      <div className="foot">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
          {new Date(page.updated_at).toLocaleDateString()}
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
