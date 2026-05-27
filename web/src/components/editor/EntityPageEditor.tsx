/**
 * EntityPageEditor — embeds a full BlockNote page editor inside any entity page.
 *
 * Props
 *   parentType  — 'project' | 'iteration' | 'sample' | 'experiment'
 *   parentId    — the entity's own ID
 *   projectId   — the project that owns the entity (used to create + list pages)
 *   slot        — 'description' | 'notes' — which slot this editor manages
 *
 * Behavior
 *   1. Queries useProjectPages(projectId) for a page matching parentType +
 *      parentId + slot.
 *   2. If none found, creates one via useCreatePage seeded with a single empty
 *      paragraph.
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
  slot: 'description' | 'notes';
}

// ─── Default seed blocks for a fresh entity slot page ─────────────────────────

function makeSeedBlocks(): unknown[] {
  return [
    {
      type: 'paragraph',
      props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
      content: [],
      children: [],
    },
  ];
}

// ─── EntityPageEditor ─────────────────────────────────────────────────────────

export function EntityPageEditor({ parentType, parentId, projectId, slot }: EntityPageEditorProps) {
  const { data: pages = [], isLoading: pagesLoading } = useProjectPages(projectId);
  const createPage = useCreatePage();

  const [resolvedPageId, setResolvedPageId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);

  // Only attempt resolution/creation once per slot.
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (pagesLoading || resolvedRef.current) return;

    const match = pages.find(
      p => p.parent_type === parentType && p.parent_id === parentId && p.slot === slot
    );

    if (match) {
      resolvedRef.current = true;
      setResolvedPageId(match.id);
      return;
    }

    // No existing page for this slot — create one with a minimal seed.
    resolvedRef.current = true;
    setCreating(true);

    createPage.mutateAsync({
      projectId,
      parentType,
      parentId,
      slot,
      blocks: makeSeedBlocks(),
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
        enablePresence={slot !== 'notes'}
      />
    </div>
  );
}
