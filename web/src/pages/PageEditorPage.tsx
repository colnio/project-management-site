/**
 * PageEditorPage — full-screen lab notebook page editor.
 * Route: /pages/:pageId
 *
 * Features:
 * - BlockNote rich-text editor
 * - Custom @sample / @experiment / @artifact reference blocks
 * - Debounced auto-save (10s idle, window blur, Ctrl/Cmd-S)
 * - ETag conflict detection (412 → conflict UI)
 * - Presence heartbeat + indicator
 * - History panel with diff and restore
 */

import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useParams } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import { useAuth } from '@/hooks/useAuth';
import {
  usePage,
  useRevisions,
  useRevisionDiff,
  usePresence,
  useRestorePage,
  useHeartbeat,
  putPage,
  fetchPage,
  pageKeys,
} from '@/hooks/usePageQueries';
import type { GetPageResponse, Revision, DiffLine } from '@/hooks/usePageQueries';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectSamples, useProjectExperiments } from '@/hooks/useQueries';
import type { Sample, Experiment } from '@/api/types';

// ─── BlockNote imports ────────────────────────────────────────────────────────

import '@blocknote/mantine/style.css';
import {
  filterSuggestionItems,
  // v0.51 uses insertOrUpdateBlockForSlashMenu not insertOrUpdateBlock
  insertOrUpdateBlockForSlashMenu as insertOrUpdateBlock,
} from '@blocknote/core';
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';

// ─── Stable random client ID ──────────────────────────────────────────────────

function useClientId(): string {
  const ref = useRef<string | null>(null);
  if (!ref.current) {
    ref.current =
      sessionStorage.getItem('page_client_id') ??
      (() => {
        const id = `clt_${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem('page_client_id', id);
        return id;
      })();
  }
  return ref.current;
}

// ─── Reference insertion ──────────────────────────────────────────────────────
// NOTE: Custom React block specs (`createReactBlockSpec`) are incompatible with
// the installed BlockNote 0.51 + @blocknote/mantine + @tiptap/react 3.x stack in
// this environment — mounting an editor whose schema contains them throws
// "render2 is not a function" inside @tiptap/react's ReactNodeViewRenderer
// (a Context.Consumer is rendered with a non-function child), crashing the page.
// Until the dependency mismatch is resolved, the editor uses the default schema
// and `@sample` / `@experiment` references are inserted as an inline text
// representation instead of bespoke cards, so the editor mounts and stays
// editable rather than crashing.

// ─── Conflict UI ──────────────────────────────────────────────────────────────

interface ConflictBannerProps {
  serverPage: GetPageResponse;
  onReload: () => void;
  onOverwrite: () => void;
}

function ConflictBanner({ serverPage, onReload, onOverwrite }: ConflictBannerProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 52,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        background: 'var(--surface)',
        border: '1px solid var(--bad)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(20,18,14,.15)',
        padding: '16px 22px',
        maxWidth: 560,
        width: '90%',
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--bad)', marginBottom: 8, fontSize: 14 }}>
        Edit conflict — another revision was saved while you were editing
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
        Server revision:{' '}
        <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
          {serverPage.current_revision_id?.slice(0, 8) ?? 'unknown'}
        </code>
        . Reload to use the server version, or force overwrite with your current changes.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="top-btn" onClick={onReload}>
          Reload server version
        </button>
        <button className="top-btn primary" onClick={onOverwrite}>
          Force overwrite
        </button>
      </div>
    </div>
  );
}

// ─── Presence Indicator ───────────────────────────────────────────────────────

function PresenceIndicator({
  pageId,
  currentUserId,
}: {
  pageId: string;
  currentUserId: string;
}) {
  const { data: entries = [] } = usePresence(pageId);
  const others = entries.filter(e => e.user_id !== currentUserId);
  if (others.length === 0) return null;
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--muted)',
        fontFamily: 'var(--mono)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#7da653',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {others.length === 1 ? '1 other is editing' : `${others.length} others editing`}
    </span>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  pageId,
  currentRevisionId,
  onClose,
  onRestored,
}: {
  pageId: string;
  currentRevisionId?: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { data: revisions = [], isLoading } = useRevisions(pageId);
  const restore = useRestorePage();
  const [diffAgainst, setDiffAgainst] = useState<string | null>(null);

  const { data: diff = [] } = useRevisionDiff(
    currentRevisionId,
    diffAgainst ?? undefined
  );

  const handleRestore = async (revisionId: string) => {
    await restore.mutateAsync({ pageId, revisionId });
    onRestored();
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--line)',
        boxShadow: '-4px 0 24px rgba(20,18,14,.10)',
        zIndex: 150,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '13px 16px',
          borderBottom: '1px solid var(--line)',
          gap: 10,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Revision history</span>
        {diffAgainst && (
          <button
            className="top-btn"
            style={{ fontSize: 11 }}
            onClick={() => setDiffAgainst(null)}
          >
            Close diff
          </button>
        )}
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      {diffAgainst && diff.length > 0 && (
        <div
          style={{
            borderBottom: '1px solid var(--line)',
            padding: '10px 14px',
            maxHeight: '40%',
            overflowY: 'auto',
          }}
        >
          <DiffViewer lines={diff} />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {isLoading ? (
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        ) : revisions.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>
            No revisions yet.
          </div>
        ) : (
          revisions.map(rev => (
            <RevisionRow
              key={rev.id}
              revision={rev}
              isCurrent={rev.id === currentRevisionId}
              isDiffTarget={rev.id === diffAgainst}
              onDiff={() => setDiffAgainst(rev.id === diffAgainst ? null : rev.id)}
              onRestore={() => void handleRestore(rev.id)}
              restoring={restore.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RevisionRow({
  revision,
  isCurrent,
  isDiffTarget,
  onDiff,
  onRestore,
  restoring,
}: {
  revision: Revision;
  isCurrent: boolean;
  isDiffTarget: boolean;
  onDiff: () => void;
  onRestore: () => void;
  restoring: boolean;
}) {
  const timeStr = new Date(revision.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div
      style={{
        padding: '9px 16px',
        borderBottom: '1px solid var(--line)',
        background: isDiffTarget ? 'var(--ember-tint)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            background: revision.source === 'human' ? 'var(--ink)' : 'var(--paper-2)',
            color: revision.source === 'human' ? 'var(--paper)' : 'var(--muted)',
            padding: '1px 6px',
            borderRadius: 99,
            border: '1px solid var(--line)',
          }}
        >
          {revision.source === 'human' ? 'manual' : 'auto'}
        </span>
        {isCurrent && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--good)',
              background: 'var(--pill-active-bg)',
              padding: '1px 6px',
              borderRadius: 99,
              border: '1px solid var(--pill-active-bd)',
            }}
          >
            current
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
          }}
        >
          {timeStr}
        </span>
      </div>
      {revision.label && (
        <div style={{ fontSize: 12.5, color: 'var(--ink)', marginBottom: 4 }}>
          {revision.label}
        </div>
      )}
      {revision.author && (
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted)',
            marginBottom: 6,
          }}
        >
          {revision.author}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {!isCurrent && (
          <button
            className="top-btn"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={onDiff}
          >
            {isDiffTarget ? 'Close diff' : 'Diff vs current'}
          </button>
        )}
        {!isCurrent && (
          <button
            className="top-btn primary"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={onRestore}
            disabled={restoring}
          >
            {restoring ? 'Restoring…' : 'Restore'}
          </button>
        )}
      </div>
    </div>
  );
}

function DiffViewer({ lines }: { lines: DiffLine[] }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11.5,
        lineHeight: 1.6,
        background: 'var(--paper)',
        borderRadius: 6,
        padding: '8px 12px',
        overflow: 'auto',
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            color:
              line.op === '+'
                ? 'var(--good)'
                : line.op === '-'
                  ? 'var(--bad)'
                  : 'var(--muted)',
            background:
              line.op === '+'
                ? 'rgba(90,125,58,.07)'
                : line.op === '-'
                  ? 'rgba(185,78,60,.07)'
                  : undefined,
            padding: '0 4px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {line.op === '+' ? '+ ' : line.op === '-' ? '- ' : '  '}
          {line.text}
        </div>
      ))}
    </div>
  );
}

// ─── Save Status Badge ────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const map: Record<SaveStatus, { label: string; color: string }> = {
    idle: { label: 'Unsaved', color: 'var(--warn)' },
    saving: { label: 'Saving…', color: 'var(--muted)' },
    saved: { label: 'Saved', color: 'var(--good)' },
    error: { label: 'Save failed', color: 'var(--bad)' },
    conflict: { label: 'Conflict!', color: 'var(--bad)' },
  };
  const { label, color } = map[status];
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color }}>
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          marginRight: 5,
          verticalAlign: 1,
        }}
      />
      {label}
    </span>
  );
}

// ─── Ref Picker Modal ─────────────────────────────────────────────────────────

function RefPickerModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ gap: 6 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Editor error boundary + read-only fallback ───────────────────────────────
// The BlockNote rich editor (@blocknote/mantine) currently throws at mount in
// this environment due to an upstream @blocknote 0.51 ↔ @tiptap/react 3.x
// incompatibility ("render2 is not a function" inside tiptap's React renderer).
// Rather than crash the whole route, we catch the mount error and render the
// page's saved content read-only, so /pages/:id is always usable. When the
// dependency mismatch is resolved, the live editor renders and this fallback
// stays dormant.

class EditorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn('Rich editor failed to mount; showing read-only content.', err, info);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// blockText extracts plain text from a BlockNote-style block for the fallback.
function blockText(block: unknown): string {
  if (block == null || typeof block !== 'object') return '';
  const b = block as Record<string, unknown>;
  if (typeof b.text === 'string') return b.text;
  if (Array.isArray(b.content)) {
    return b.content
      .map(c =>
        c && typeof c === 'object' && typeof (c as Record<string, unknown>).text === 'string'
          ? ((c as Record<string, unknown>).text as string)
          : ''
      )
      .join('');
  }
  return '';
}

function ReadonlyPageFallback({ page }: { page?: GetPageResponse }) {
  const blocks = Array.isArray(page?.blocks) ? (page!.blocks as unknown[]) : [];
  const md = page?.markdown_export?.trim();
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11.5,
          color: 'var(--warn)',
          background: 'var(--paper-2)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 18,
        }}
      >
        Rich editor unavailable in this build — showing saved content read-only.
      </div>
      <div style={{ fontFamily: 'var(--sans)', color: 'var(--ink)', lineHeight: 1.7, fontSize: 15 }}>
        {blocks.length > 0 ? (
          blocks.map((b, i) => <p key={i} style={{ margin: '0 0 12px' }}>{blockText(b)}</p>)
        ) : md ? (
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{md}</pre>
        ) : (
          <span style={{ color: 'var(--muted)' }}>This page has no content yet.</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page Editor ─────────────────────────────────────────────────────────

export function PageEditorPage() {
  const { pageId } = useParams({ strict: false }) as { pageId: string };
  const { user } = useAuth();
  const qc = useQueryClient();
  const clientId = useClientId();
  const heartbeat = useHeartbeat();

  // Server state
  const { data: pageData, isLoading, isError } = usePage(pageId);

  // Local editor state
  const etagRef = useRef<string>('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [conflictPage, setConflictPage] = useState<GetPageResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track etag from loaded data
  useEffect(() => {
    if (pageData?._etag) {
      etagRef.current = pageData._etag;
    }
  }, [pageData]);

  // Initialize BlockNote (default schema — see note above on custom block specs)
  const editor = useCreateBlockNote();

  // Load page content into editor once
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!pageData || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const blocks = pageData.blocks;
      if (Array.isArray(blocks) && blocks.length > 0) {
        editor.replaceBlocks(
          editor.document,
          blocks as Parameters<typeof editor.replaceBlocks>[1]
        );
      }
    } catch {
      // ignore parse errors — start fresh
    }
  }, [pageData, editor]);

  // ─── Save logic ─────────────────────────────────────────────────────────────

  const save = useCallback(
    async (source: 'human' | 'auto_save') => {
      if (!isDirty && source === 'auto_save') return;
      setSaveStatus('saving');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      const blocks = editor.document;
      const result = await putPage(pageId, etagRef.current, { blocks, source });

      if (result.status === 412) {
        // Conflict — server has a newer revision
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const details = (result.data as any)?.details?.current;
        const currentState: GetPageResponse = details ?? (await fetchPage(pageId));
        setSaveStatus('conflict');
        setConflictPage(currentState);
        return;
      }

      if (!result.data?.page) {
        setSaveStatus('error');
        return;
      }

      etagRef.current = result.etag;
      setSaveStatus('saved');
      setIsDirty(false);
      void qc.invalidateQueries({ queryKey: pageKeys.revisions(pageId) });
      void qc.invalidateQueries({ queryKey: pageKeys.page(pageId) });
    },
    [editor, isDirty, pageId, qc]
  );

  // ─── Editor change handler ───────────────────────────────────────────────────

  const onEditorChange = useCallback(() => {
    setIsDirty(true);
    if (saveStatus !== 'conflict') setSaveStatus('idle');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void save('auto_save');
    }, 10000);
  }, [save, saveStatus]);

  // ─── Window blur auto-save ───────────────────────────────────────────────────

  useEffect(() => {
    const handleBlur = () => {
      if (isDirty) void save('auto_save');
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [isDirty, save]);

  // ─── Ctrl/Cmd-S manual save ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void save('human');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save]);

  // ─── Heartbeat ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const send = () => void heartbeat.mutate({ pageId, clientId });
    send();
    const interval = setInterval(send, 15000);
    return () => clearInterval(interval);
  }, [pageId, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Conflict handlers ───────────────────────────────────────────────────────

  const handleReloadServerVersion = useCallback(async () => {
    const fresh = await fetchPage(pageId);
    etagRef.current = fresh._etag ?? '';
    try {
      const blocks = fresh.blocks;
      if (Array.isArray(blocks) && blocks.length > 0) {
        editor.replaceBlocks(
          editor.document,
          blocks as Parameters<typeof editor.replaceBlocks>[1]
        );
      }
    } catch {
      // ignore
    }
    setConflictPage(null);
    setIsDirty(false);
    setSaveStatus('saved');
    void qc.invalidateQueries({ queryKey: pageKeys.page(pageId) });
  }, [pageId, editor, qc]);

  const handleOverwrite = useCallback(async () => {
    if (!conflictPage?._etag) return;
    etagRef.current = conflictPage._etag;
    setConflictPage(null);
    await save('human');
  }, [conflictPage, save]);

  // ─── Reference insertion ──────────────────────────────────────────────────────

  const [refPickerOpen, setRefPickerOpen] = useState<
    'sample' | 'experiment' | null
  >(null);

  const projectId = pageData?.project_id;
  const { data: samples = [] } = useProjectSamples(projectId);
  const { data: experiments = [] } = useProjectExperiments(projectId);

  // Degraded inline-text representation (custom ref blocks disabled — see note).
  const insertSampleRef = (sample: Sample) => {
    insertOrUpdateBlock(editor as unknown as Parameters<typeof insertOrUpdateBlock>[0], {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `@sample ${sample.identifier}${sample.name ? ` — ${sample.name}` : ''}`,
          styles: { bold: true },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setRefPickerOpen(null);
  };

  const insertExperimentRef = (exp: Experiment) => {
    insertOrUpdateBlock(editor as unknown as Parameters<typeof insertOrUpdateBlock>[0], {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `@experiment ${exp.method} (${exp.id.slice(0, 8)})`,
          styles: { bold: true },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setRefPickerOpen(null);
  };

  // ─── Custom slash menu items ─────────────────────────────────────────────────

  const getCustomItems = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ed: any): DefaultReactSuggestionItem[] => [
      ...getDefaultReactSlashMenuItems(ed),
      {
        title: 'Sample reference',
        aliases: ['@sample', 'sample ref'],
        group: 'Lab references',
        icon: <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontStyle: 'italic' }}>s</span>,
        subtext: 'Embed a sample card',
        onItemClick: () => setRefPickerOpen('sample'),
      },
      {
        title: 'Experiment reference',
        aliases: ['@experiment', 'exp ref'],
        group: 'Lab references',
        icon: <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontStyle: 'italic' }}>e</span>,
        subtext: 'Embed an experiment card',
        onItemClick: () => setRefPickerOpen('experiment'),
      },
    ],
    []
  );

  // ─── Breadcrumbs ─────────────────────────────────────────────────────────────

  const crumbs = [
    {
      label: 'Project',
      href: pageData?.project_id ? `/projects/${pageData.project_id}` : '/',
    },
    { label: 'Page editor' },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────

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

  return (
    <AppShell
      topBarCrumbs={crumbs}
      topBarActions={
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
          <button
            className="top-btn primary"
            onClick={() => void save('human')}
            disabled={saveStatus === 'saving'}
          >
            Save
          </button>
        </div>
      }
    >
      {/* Conflict overlay */}
      {conflictPage && (
        <ConflictBanner
          serverPage={conflictPage}
          onReload={() => void handleReloadServerVersion()}
          onOverwrite={() => void handleOverwrite()}
        />
      )}

      {/* History panel */}
      {showHistory && pageData && (
        <HistoryPanel
          pageId={pageId}
          currentRevisionId={pageData.current_revision_id}
          onClose={() => setShowHistory(false)}
          onRestored={async () => {
            const fresh = await fetchPage(pageId);
            etagRef.current = fresh._etag ?? '';
            try {
              const blocks = fresh.blocks;
              if (Array.isArray(blocks) && blocks.length > 0) {
                editor.replaceBlocks(
                  editor.document,
                  blocks as Parameters<typeof editor.replaceBlocks>[1]
                );
              }
            } catch {
              // ignore
            }
            setSaveStatus('saved');
            setIsDirty(false);
          }}
        />
      )}

      {/* Reference picker modals */}
      {refPickerOpen === 'sample' && (
        <RefPickerModal
          title="Insert sample reference"
          onClose={() => setRefPickerOpen(null)}
        >
          {samples.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              No samples in this project.
            </div>
          ) : (
            samples.map(s => (
              <button
                key={s.id}
                className="ref-picker-item"
                onClick={() => insertSampleRef(s)}
              >
                <span className="ref-glyph" style={{ color: 'var(--ref-sample-fg)' }}>
                  s
                </span>
                <span
                  style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)' }}
                >
                  {s.identifier}
                </span>
                <span style={{ flex: 1 }}>{s.name}</span>
                <span className={`pill k-${s.kind}`} style={{ fontSize: 10 }}>
                  {s.kind}
                </span>
                <StatusPill status={s.status} />
              </button>
            ))
          )}
        </RefPickerModal>
      )}

      {refPickerOpen === 'experiment' && (
        <RefPickerModal
          title="Insert experiment reference"
          onClose={() => setRefPickerOpen(null)}
        >
          {experiments.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              No experiments in this project.
            </div>
          ) : (
            experiments.map(e => (
              <button
                key={e.id}
                className="ref-picker-item"
                onClick={() => insertExperimentRef(e)}
              >
                <span className="ref-glyph" style={{ color: 'var(--ref-exp-fg)' }}>
                  e
                </span>
                <span
                  style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}
                >
                  {e.id.slice(0, 8)}…
                </span>
                <span style={{ flex: 1 }}>{e.method}</span>
                <StatusPill status={e.status} />
              </button>
            ))
          )}
        </RefPickerModal>
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
            <span
              style={{
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                fontSize: 10.5,
              }}
            >
              {pageData.parent_type}
            </span>
            <span style={{ color: 'var(--ember)' }}>
              {pageData.parent_id.slice(0, 12)}…
            </span>
            {pageData.current_revision_id && (
              <span style={{ marginLeft: 'auto' }}>
                rev {pageData.current_revision_id.slice(0, 8)}…
              </span>
            )}
          </div>
        )}

        {/* BlockNote editor (with graceful read-only fallback on mount failure) */}
        <EditorBoundary fallback={<ReadonlyPageFallback page={pageData} />}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <BlockNoteView
            editor={editor as any}
            onChange={onEditorChange}
            slashMenu={false}
            style={{ fontFamily: 'var(--sans)', color: 'var(--ink)' }}
          >
            <SuggestionMenuController
              triggerCharacter="/"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              getItems={async (query: string) =>
                filterSuggestionItems(getCustomItems(editor), query)
              }
            />
          </BlockNoteView>
        </EditorBoundary>
      </div>
    </AppShell>
  );
}
