/**
 * WikiPage — /wiki and /wiki/:pageId
 *
 * Two-pane layout: left panel lists all site-global wiki pages; right pane
 * renders the selected page via PageEditorCore (which handles saving via
 * /v1/pages/{id} without needing a project context).
 */

import { useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/LoadingState';
import { useWikiPages, useCreateWikiPage } from '@/hooks/usePageQueries';
import { PageEditorCore, SaveStatusBadge } from '@/components/editor/PageEditorCore';
import type { SaveStatus } from '@/components/editor/PageEditorCore';

// ─── WikiSidebar ──────────────────────────────────────────────────────────────

interface WikiSidebarProps {
  selectedPageId?: string;
  onSelectPage: (id: string) => void;
}

function WikiSidebar({ selectedPageId, onSelectPage }: WikiSidebarProps) {
  const { data: pages = [], isLoading, isError } = useWikiPages();
  const createWikiPage = useCreateWikiPage();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleCreate = () => {
    const title = newTitle.trim() || 'Untitled';
    createWikiPage.mutate(
      { title },
      {
        onSuccess: (data) => {
          setCreating(false);
          setNewTitle('');
          onSelectPage(data.page.id);
        },
      }
    );
  };

  return (
    <div
      style={{
        width: 220,
        minWidth: 180,
        flexShrink: 0,
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--paper-2)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 14px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--muted-2)',
          }}
        >
          Pages
        </span>
        <button
          className="top-btn"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => {
            setCreating(true);
            setNewTitle('');
          }}
          title="New wiki page"
        >
          + New page
        </button>
      </div>

      {/* New page input */}
      {creating && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewTitle('');
              }
            }}
            placeholder="Page title…"
            style={{
              width: '100%',
              fontSize: 12.5,
              padding: '5px 8px',
              border: '1px solid var(--line-2)',
              borderRadius: 5,
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontFamily: 'var(--sans)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              className="top-btn primary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={handleCreate}
              disabled={createWikiPage.isPending}
            >
              {createWikiPage.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              className="top-btn"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => {
                setCreating(false);
                setNewTitle('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Page list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {isLoading && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted-2)', fontStyle: 'italic' }}>
            Loading…
          </div>
        )}
        {isError && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--bad)' }}>
            Failed to load pages.
          </div>
        )}
        {!isLoading && !isError && pages.length === 0 && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted-2)', fontStyle: 'italic' }}>
            No wiki pages yet.
          </div>
        )}
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => onSelectPage(page.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '7px 14px',
              fontSize: 13,
              fontFamily: 'var(--sans)',
              color: page.id === selectedPageId ? 'var(--ink)' : 'var(--muted)',
              background: page.id === selectedPageId ? 'var(--surface)' : 'transparent',
              border: 'none',
              borderLeft: page.id === selectedPageId ? '2px solid var(--ember)' : '2px solid transparent',
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
            }}
            title={page.title}
          >
            {page.title || 'Untitled'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── WikiPage ─────────────────────────────────────────────────────────────────

export function WikiPage() {
  const { pageId: routePageId } = useParams({ strict: false }) as { pageId?: string };
  const navigate = useNavigate();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  const selectedPageId = routePageId;

  const handleSelectPage = (id: string) => {
    void navigate({ to: '/wiki/$pageId', params: { pageId: id } });
  };

  const crumbs = [
    { label: 'Wiki' },
    ...(selectedPageId ? [{ label: 'Page' }] : []),
  ];

  const topBarActions = selectedPageId ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <SaveStatusBadge status={saveStatus} />
    </div>
  ) : undefined;

  return (
    <AppShell topBarCrumbs={crumbs} topBarActions={topBarActions}>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        {/* Left panel */}
        <WikiSidebar selectedPageId={selectedPageId} onSelectPage={handleSelectPage} />

        {/* Right pane */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!selectedPageId ? (
            <div style={{ padding: '48px 40px' }}>
              <EmptyState message="Select a wiki page on the left, or create a new one." />
            </div>
          ) : (
            <div
              style={{
                maxWidth: 860,
                margin: '0 auto',
                padding: '28px 32px 120px',
                minHeight: '100%',
              }}
            >
              <PageEditorCore
                key={selectedPageId}
                pageId={selectedPageId}
                showToolbar={false}
                onSaveStatus={setSaveStatus}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
