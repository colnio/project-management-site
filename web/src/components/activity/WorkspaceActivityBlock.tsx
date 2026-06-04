/**
 * WorkspaceActivityBlock — collapsible activity timeline for a single workspace.
 * Header uses WorkspacesPage WorkspaceSection style (initial badge + name).
 */
import { useState } from 'react';
import { useWorkspaceActivity } from '@/hooks/useActivityQueries';
import { LoadingState, EmptyState } from '@/components/LoadingState';
import { ActivityRow } from './ActivityRow';

interface WorkspaceActivityBlockProps {
  workspace: { id: string; name: string };
}

export function WorkspaceActivityBlock({ workspace }: WorkspaceActivityBlockProps) {
  const [open, setOpen] = useState(true);
  const { items, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useWorkspaceActivity(workspace.id);

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Header — mirrors WorkspacesPage WorkspaceSection style */}
      <div className="section-h" style={{ marginBottom: open ? 14 : 0 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'var(--ink)',
              color: 'var(--paper)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'Libre Baskerville, serif',
            }}
          >
            {workspace.name[0]?.toUpperCase()}
          </span>
          {workspace.name}
        </h2>
        <span className="meta">{items.length} event{items.length !== 1 ? 's' : ''}</span>
        <span className="right">
          <button
            className="top-btn"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
          >
            {open ? '▾ Collapse' : '▸ Expand'}
          </button>
        </span>
      </div>

      {open && (
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 10,
            background: 'var(--surface)',
            padding: '16px 18px',
          }}
        >
          {isLoading ? (
            <LoadingState message="Loading activity…" />
          ) : items.length === 0 ? (
            <EmptyState message="No recent activity" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.map((item, idx) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  isLast={idx === items.length - 1 && !hasNextPage}
                />
              ))}
            </div>
          )}

          {hasNextPage && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <button
                className="top-btn"
                style={{ fontSize: 12 }}
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
