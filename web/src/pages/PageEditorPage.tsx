/**
 * PageEditorPage — full-screen lab notebook page editor.
 * Route: /pages/:pageId
 *
 * Features:
 * - BlockNote rich-text editor (via PageEditorCore)
 * - Custom @sample / @experiment / @artifact reference blocks
 * - Debounced auto-save (10s idle, window blur, Ctrl/Cmd-S)
 * - ETag conflict detection (412 → conflict UI)
 * - Presence heartbeat + indicator
 * - History panel with diff and restore
 *
 * The core editor logic lives in PageEditorCore; this file owns the AppShell
 * wrapper, breadcrumbs, and the top-bar save/history/presence controls that
 * are specific to the full-page route.
 */

import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { useAuth } from '@/hooks/useAuth';
import { usePage } from '@/hooks/usePageQueries';
import { PageEditorCore, SaveStatusBadge, PresenceIndicator, HistoryPanel } from '@/components/editor/PageEditorCore';
import type { SaveStatus } from '@/components/editor/PageEditorCore';
import { fetchPage } from '@/hooks/usePageQueries';

export function PageEditorPage() {
  const { pageId } = useParams({ strict: false }) as { pageId: string };
  const { user } = useAuth();

  // Server state — needed for breadcrumbs and top-bar only.
  const { data: pageData, isLoading, isError } = usePage(pageId);

  // Top-bar state managed at the page level (passed down to toolbar via
  // onSaveStatus and surface-level state).
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [showHistory, setShowHistory] = useState(false);

  // ─── Breadcrumbs ─────────────────────────────────────────────────────────────

  const crumbs = [
    {
      label: 'Project',
      href: pageData?.project_id ? `/projects/${pageData.project_id}` : '/',
    },
    { label: 'Page editor' },
  ];

  // ─── Loading / error states ───────────────────────────────────────────────────

  if (isLoading)
    return (
      <AppShell topBarCrumbs={[{ label: 'Page' }]}>
        <LoadingState message="Loading page…" />
      </AppShell>
    );
  if (isError)
    return (
      <AppShell topBarCrumbs={[{ label: 'Page' }]}>
        <ErrorState message="Failed to load page." />
      </AppShell>
    );

  // ─── Top-bar actions ─────────────────────────────────────────────────────────
  // We surface saveStatus + presence + History/Save buttons here; PageEditorCore
  // receives showToolbar=false so it doesn't render its own duplicate toolbar.

  const topBarActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <SaveStatusBadge status={saveStatus} />
      {pageData && (
        <PresenceIndicator pageId={pageId} currentUserId={user?.id ?? ''} />
      )}
      <button
        className="top-btn"
        onClick={() => setShowHistory(h => !h)}
        style={{ background: showHistory ? 'var(--paper-2)' : undefined }}
      >
        History
      </button>
    </div>
  );

  return (
    <AppShell topBarCrumbs={crumbs} topBarActions={topBarActions}>
      {/* History panel (controlled at page level so it can overlay the AppShell) */}
      {showHistory && pageData && (
        <HistoryPanel
          pageId={pageId}
          currentRevisionId={pageData.current_revision_id}
          onClose={() => setShowHistory(false)}
          onRestored={async () => {
            // PageEditorCore will re-load once the page query is invalidated;
            // here we just close the panel.
            await fetchPage(pageId);
            setShowHistory(false);
          }}
        />
      )}

      {/* Editor content area */}
      <div
        style={{
          maxWidth: 860,
          margin: '0 auto',
          padding: '28px 32px 120px',
          minHeight: '100vh',
        }}
      >
        {/* Page metadata strip */}
        {pageData && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 24,
              padding: '8px 14px',
              background: 'var(--paper-2)',
              borderRadius: 8,
              border: '1px solid var(--line)',
              fontSize: 12,
              fontFamily: 'var(--mono)',
              color: 'var(--muted-2)',
            }}
          >
            <span style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10.5 }}>
              {pageData.parent_type}
            </span>
            <span style={{ color: 'var(--ember)' }}>{pageData.parent_id.slice(0, 12)}…</span>
            {pageData.current_revision_id && (
              <span style={{ marginLeft: 'auto' }}>
                rev {pageData.current_revision_id.slice(0, 8)}…
              </span>
            )}
          </div>
        )}

        {/* Core editor — no toolbar (toolbar lives in the AppShell top-bar) */}
        <PageEditorCore
          pageId={pageId}
          showToolbar={false}
          onSaveStatus={setSaveStatus}
        />
      </div>
    </AppShell>
  );
}
