/**
 * EntityPageEditor — embeds a full BlockNote page editor inside any entity page.
 *
 * Props
 *   parentType  — 'project' | 'iteration' | 'sample' | 'experiment'
 *   parentId    — the entity's own ID
 *   projectId   — the project that owns the entity (used to create + list pages)
 *
 * Behavior
 *   1. Queries useProjectPages(projectId) for a page matching parentType + parentId.
 *   2. If none found, creates one via useCreatePage seeded with default blocks:
 *        heading(1) "Overview"
 *        entityDashboard block (entityType=parentType, entityId=parentId)
 *        heading(2) "Notes"
 *        paragraph (empty)
 *   3. Renders PageEditorCore for the resolved pageId with an inline toolbar.
 */

import { useEffect, useRef, useState } from 'react';
import { LoadingState } from '@/components/LoadingState';
import { useProjectPages, useCreatePage } from '@/hooks/usePageQueries';
import { PageEditorCore } from '@/components/editor/PageEditorCore';

export type EntityParentType = 'project' | 'iteration' | 'sample' | 'experiment';

export interface EntityPageEditorProps {
  parentType: EntityParentType;
  parentId: string;
  projectId: string;
}

// ─── Default seed blocks for a fresh entity page ──────────────────────────────

function makeSeedBlocks(parentType: EntityParentType, parentId: string): unknown[] {
  return [
    {
      type: 'heading',
      props: { level: 1, textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
      content: [{ type: 'text', text: 'Overview', styles: {} }],
      children: [],
    },
    {
      type: 'entityDashboard',
      props: {
        entityType: parentType,
        entityId: parentId,
      },
      content: undefined,
      children: [],
    },
    {
      type: 'heading',
      props: { level: 2, textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
      content: [{ type: 'text', text: 'Notes', styles: {} }],
      children: [],
    },
    {
      type: 'paragraph',
      props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
      content: [],
      children: [],
    },
  ];
}

// ─── EntityPageEditor ─────────────────────────────────────────────────────────

export function EntityPageEditor({ parentType, parentId, projectId }: EntityPageEditorProps) {
  const { data: pages = [], isLoading: pagesLoading } = useProjectPages(projectId);
  const createPage = useCreatePage();

  const [resolvedPageId, setResolvedPageId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);

  // Only attempt resolution/creation once.
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (pagesLoading || resolvedRef.current) return;

    const match = pages.find(
      p => p.parent_type === parentType && p.parent_id === parentId
    );

    if (match) {
      resolvedRef.current = true;
      setResolvedPageId(match.id);
      return;
    }

    // No existing page — create one with default blocks.
    resolvedRef.current = true;
    setCreating(true);

    createPage.mutateAsync({
      projectId,
      parentType,
      parentId,
      blocks: makeSeedBlocks(parentType, parentId),
    })
      .then(result => {
        setResolvedPageId(result.page.id);
      })
      .catch(err => {
        console.error('EntityPageEditor: failed to create page', err);
        setCreateError(true);
      })
      .finally(() => {
        setCreating(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesLoading, pages]);

  // ─── Loading states ───────────────────────────────────────────────────────────

  if (pagesLoading || creating) {
    return (
      <div style={{ padding: '24px 0' }}>
        <LoadingState message={creating ? 'Creating page…' : 'Loading page…'} />
      </div>
    );
  }

  if (createError) {
    return (
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: 'var(--bad)',
          padding: '16px 0',
        }}
      >
        Failed to create page for this {parentType}. Refresh to try again.
      </div>
    );
  }

  if (!resolvedPageId) {
    // Still resolving (e.g. pages array is empty after load but createPage hasn't fired yet).
    return (
      <div style={{ padding: '24px 0' }}>
        <LoadingState message="Resolving page…" />
      </div>
    );
  }

  // ─── Render editor ────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
    >
      <PageEditorCore
        pageId={resolvedPageId}
        projectId={projectId}
        showToolbar={true}
      />
    </div>
  );
}
