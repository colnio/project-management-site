/**
 * PageEditorCore — the shared BlockNote editor kernel.
 *
 * Accepts a resolved pageId and renders:
 *   - BlockNote editor with custom refBlockSchema (sampleRef, experimentRef,
 *     artifactRef, entityDashboard)
 *   - Debounced auto-save (10s idle / window blur / Ctrl-S / Cmd-S)
 *   - ETag optimistic concurrency (412 → ConflictBanner)
 *   - Presence heartbeat
 *   - History panel
 *   - @-mention + slash-menu ref insertion
 *
 * Used by:
 *   - PageEditorPage  (route /pages/:pageId — adds AppShell + breadcrumbs)
 *   - EntityPageEditor (embedded inside entity pages)
 *
 * Props
 *   pageId          — required, must be a real page ID already resolved
 *   projectId       — optional; drives @-mention data. If omitted it falls
 *                     back to pageData.project_id once loaded.
 *   showToolbar     — whether to render the top toolbar (save btn, history,
 *                     presence). Default true.
 *   onSaveStatus    — optional callback invoked when save status changes.
 */

import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { useProjectSamples, useProjectExperiments, useProjectArtifacts } from '@/hooks/useQueries';
import type { Sample, Experiment, Artifact } from '@/api/types';
import { useCreateArtifact, useCompleteArtifact, uploadToPresignedUrl } from '@/hooks/useArtifactQueries';

import '@blocknote/mantine/style.css';
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu as insertOrUpdateBlock,
} from '@blocknote/core';
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';

import { refBlockSchema } from '@/components/editor/refBlocks';

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

// ─── Block normalizer ─────────────────────────────────────────────────────────

function normalizeBlocks(blocks: unknown): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map(b => {
    if (b && typeof b === 'object') {
      const blk = b as Record<string, unknown>;
      if (typeof blk.text === 'string' && blk.content === undefined) {
        const { text, ...rest } = blk;
        return { ...rest, content: [{ type: 'text', text, styles: {} }] };
      }
      if (typeof blk.content === 'string') {
        return { ...blk, content: [{ type: 'text', text: blk.content, styles: {} }] };
      }
    }
    return b;
  });
}

// ─── Save status ──────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const map: Record<SaveStatus, { label: string; color: string }> = {
    idle:     { label: 'Unsaved',     color: 'var(--warn)' },
    saving:   { label: 'Saving…',     color: 'var(--muted)' },
    saved:    { label: 'Saved',       color: 'var(--good)' },
    error:    { label: 'Save failed', color: 'var(--bad)' },
    conflict: { label: 'Conflict!',   color: 'var(--bad)' },
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

// ─── Conflict banner ──────────────────────────────────────────────────────────

function ConflictBanner({
  serverPage,
  onReload,
  onOverwrite,
}: {
  serverPage: GetPageResponse;
  onReload: () => void;
  onOverwrite: () => void;
}) {
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
        <button className="top-btn" onClick={onReload}>Reload server version</button>
        <button className="top-btn primary" onClick={onOverwrite}>Force overwrite</button>
      </div>
    </div>
  );
}

// ─── Presence indicator ───────────────────────────────────────────────────────

export function PresenceIndicator({
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
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7da653', display: 'inline-block', flexShrink: 0 }} />
      {others.length === 1 ? '1 other is editing' : `${others.length} others editing`}
    </span>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────

function DiffViewer({ lines }: { lines: DiffLine[] }) {
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.6, background: 'var(--paper)', borderRadius: 6, padding: '8px 12px', overflow: 'auto' }}>
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            color: line.op === '+' ? 'var(--good)' : line.op === '-' ? 'var(--bad)' : 'var(--muted)',
            background: line.op === '+' ? 'rgba(90,125,58,.07)' : line.op === '-' ? 'rgba(185,78,60,.07)' : undefined,
            padding: '0 4px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {line.op === '+' ? '+ ' : line.op === '-' ? '- ' : '  '}{line.text}
        </div>
      ))}
    </div>
  );
}

function RevisionRow({
  revision, isCurrent, isDiffTarget, onDiff, onRestore, restoring,
}: {
  revision: Revision;
  isCurrent: boolean;
  isDiffTarget: boolean;
  onDiff: () => void;
  onRestore: () => void;
  restoring: boolean;
}) {
  const timeStr = new Date(revision.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--line)', background: isDiffTarget ? 'var(--ember-tint)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, background: revision.source === 'human' ? 'var(--ink)' : 'var(--paper-2)', color: revision.source === 'human' ? 'var(--paper)' : 'var(--muted)', padding: '1px 6px', borderRadius: 99, border: '1px solid var(--line)' }}>
          {revision.source === 'human' ? 'manual' : 'auto'}
        </span>
        {isCurrent && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--good)', background: 'var(--pill-active-bg)', padding: '1px 6px', borderRadius: 99, border: '1px solid var(--pill-active-bd)' }}>
            current
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>{timeStr}</span>
      </div>
      {revision.label && <div style={{ fontSize: 12.5, color: 'var(--ink)', marginBottom: 4 }}>{revision.label}</div>}
      {revision.author && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{revision.author}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        {!isCurrent && <button className="top-btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={onDiff}>{isDiffTarget ? 'Close diff' : 'Diff vs current'}</button>}
        {!isCurrent && <button className="top-btn primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={onRestore} disabled={restoring}>{restoring ? 'Restoring…' : 'Restore'}</button>}
      </div>
    </div>
  );
}

export function HistoryPanel({
  pageId, currentRevisionId, onClose, onRestored,
}: {
  pageId: string;
  currentRevisionId?: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { data: revisions = [], isLoading } = useRevisions(pageId);
  const restore = useRestorePage();
  const [diffAgainst, setDiffAgainst] = useState<string | null>(null);
  const { data: diff = [] } = useRevisionDiff(currentRevisionId, diffAgainst ?? undefined);

  const handleRestore = async (revisionId: string) => {
    await restore.mutateAsync({ pageId, revisionId });
    onRestored();
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
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
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid var(--line)', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Revision history</span>
        {diffAgainst && <button className="top-btn" style={{ fontSize: 11 }} onClick={() => setDiffAgainst(null)}>Close diff</button>}
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>
      {diffAgainst && diff.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--line)', padding: '10px 14px', maxHeight: '40%', overflowY: 'auto' }}>
          <DiffViewer lines={diff} />
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {isLoading ? (
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        ) : revisions.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>No revisions yet.</div>
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

// ─── Ref picker modal ─────────────────────────────────────────────────────────

function RefPickerModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ gap: 6 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Read-only fallback ───────────────────────────────────────────────────────

function blockText(block: unknown): string {
  if (block == null || typeof block !== 'object') return '';
  const b = block as Record<string, unknown>;
  if (typeof b.text === 'string') return b.text;
  if (Array.isArray(b.content)) {
    return b.content.map(c => c && typeof c === 'object' && typeof (c as Record<string, unknown>).text === 'string' ? ((c as Record<string, unknown>).text as string) : '').join('');
  }
  return '';
}

function ReadonlyPageFallback({ page }: { page?: GetPageResponse }) {
  const blocks = Array.isArray(page?.blocks) ? (page!.blocks as unknown[]) : [];
  const md = page?.markdown_export?.trim();
  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--warn)', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', marginBottom: 18 }}>
        Rich editor unavailable in this build — showing saved content read-only.
      </div>
      <div style={{ fontFamily: 'var(--sans)', color: 'var(--ink)', lineHeight: 1.7, fontSize: 15 }}>
        {blocks.length > 0
          ? blocks.map((b, i) => <p key={i} style={{ margin: '0 0 12px' }}>{blockText(b)}</p>)
          : md
            ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{md}</pre>
            : <span style={{ color: 'var(--muted)' }}>This page has no content yet.</span>
        }
      </div>
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────

class EditorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn('Rich editor failed to mount; showing read-only content.', err, info);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// ─── StatusPill import alias ──────────────────────────────────────────────────

import { StatusPill } from '@/components/StatusPill';

// ─── PageEditorCore ───────────────────────────────────────────────────────────

export interface PageEditorCoreProps {
  pageId: string;
  /** Pre-known projectId. Falls back to pageData.project_id after load. */
  projectId?: string;
  /** Whether to render the save/history/presence toolbar above the editor. */
  showToolbar?: boolean;
  /** Optional callback when save status changes. */
  onSaveStatus?: (status: SaveStatus) => void;
  /** Whether this editor runs the presence heartbeat/indicator. Default true.
   *  Set false for secondary editors on the same screen to avoid duplicate
   *  heartbeat/poll loops (e.g. the notes slot when the description slot covers it). */
  enablePresence?: boolean;
}

export function PageEditorCore({
  pageId,
  projectId: propProjectId,
  showToolbar = true,
  onSaveStatus,
  enablePresence = true,
}: PageEditorCoreProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const clientId = useClientId();
  const heartbeat = useHeartbeat();

  const { data: pageData } = usePage(pageId);

  const etagRef = useRef<string>('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [conflictPage, setConflictPage] = useState<GetPageResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSaveStatusNotify = useCallback((s: SaveStatus) => {
    setSaveStatus(s);
    onSaveStatus?.(s);
  }, [onSaveStatus]);

  useEffect(() => {
    if (pageData?._etag) etagRef.current = pageData._etag;
  }, [pageData]);

  const editor = useCreateBlockNote({ schema: refBlockSchema });

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!pageData || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const blocks = normalizeBlocks(pageData.blocks);
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks as Parameters<typeof editor.replaceBlocks>[1]);
      }
    } catch { /* ignore */ }
  }, [pageData, editor]);

  // ─── Save logic ─────────────────────────────────────────────────────────────

  const save = useCallback(
    async (source: 'human' | 'auto_save') => {
      if (!isDirty && source === 'auto_save') return;
      setSaveStatusNotify('saving');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      const blocks = editor.document;
      const result = await putPage(pageId, etagRef.current, { blocks, source });

      if (result.status === 412) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const details = (result.data as any)?.details?.current;
        const currentState: GetPageResponse = details ?? (await fetchPage(pageId));
        setSaveStatusNotify('conflict');
        setConflictPage(currentState);
        return;
      }
      if (!result.data?.page) {
        setSaveStatusNotify('error');
        return;
      }
      etagRef.current = result.etag;
      setSaveStatusNotify('saved');
      setIsDirty(false);
      void qc.invalidateQueries({ queryKey: pageKeys.revisions(pageId) });
      // Update the page cache from the save response instead of refetching it,
      // avoiding an extra GET per save (and a doubled storm with two editors).
      qc.setQueryData<GetPageResponse>(pageKeys.page(pageId), (prev) =>
        prev
          ? {
              ...prev,
              blocks: result.data.blocks,
              current_revision_id: result.data.page.current_revision_id ?? prev.current_revision_id,
              _etag: result.etag,
            }
          : prev
      );
    },
    [editor, isDirty, pageId, qc, setSaveStatusNotify]
  );

  // ─── Auto-save triggers ──────────────────────────────────────────────────────

  const onEditorChange = useCallback(() => {
    setIsDirty(true);
    if (saveStatus !== 'conflict') setSaveStatusNotify('idle');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { void save('auto_save'); }, 10000);
  }, [save, saveStatus, setSaveStatusNotify]);

  useEffect(() => {
    const handleBlur = () => { if (isDirty) void save('auto_save'); };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [isDirty, save]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save('human'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save]);

  // ─── Heartbeat ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enablePresence) return;
    const send = () => void heartbeat.mutate({ pageId, clientId });
    send();
    const interval = setInterval(send, 30000);
    return () => clearInterval(interval);
  }, [pageId, clientId, enablePresence]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Conflict handlers ───────────────────────────────────────────────────────

  const handleReloadServerVersion = useCallback(async () => {
    const fresh = await fetchPage(pageId);
    etagRef.current = fresh._etag ?? '';
    try {
      const blocks = normalizeBlocks(fresh.blocks);
      if (blocks.length > 0) editor.replaceBlocks(editor.document, blocks as Parameters<typeof editor.replaceBlocks>[1]);
    } catch { /* ignore */ }
    setConflictPage(null);
    setIsDirty(false);
    setSaveStatusNotify('saved');
    void qc.invalidateQueries({ queryKey: pageKeys.page(pageId) });
  }, [pageId, editor, qc, setSaveStatusNotify]);

  const handleOverwrite = useCallback(async () => {
    if (!conflictPage?._etag) return;
    etagRef.current = conflictPage._etag;
    setConflictPage(null);
    await save('human');
  }, [conflictPage, save]);

  // ─── Attachment upload (imageEmbed / pdfEmbed / htmlEmbed) ───────────────────

  const effectiveProjectIdForUpload = propProjectId ?? pageData?.project_id ?? '';
  const createArtifact = useCreateArtifact(effectiveProjectIdForUpload);
  const completeArtifact = useCompleteArtifact();

  const imageFileRef = useRef<HTMLInputElement>(null);
  const pdfFileRef   = useRef<HTMLInputElement>(null);
  const htmlFileRef  = useRef<HTMLInputElement>(null);

  const runEmbedUpload = useCallback(
    async (
      file: File,
      artType: 'image' | 'pdf' | 'other',
      blockType: 'imageEmbed' | 'pdfEmbed' | 'htmlEmbed'
    ) => {
      if (!effectiveProjectIdForUpload) {
        alert('Cannot upload: project ID is not yet available. Please try again in a moment.');
        return;
      }
      try {
        const res = await createArtifact.mutateAsync({
          filename:     file.name,
          content_type: file.type || 'application/octet-stream',
          size_bytes:   file.size,
          type:         artType,
        });
        await uploadToPresignedUrl(res.upload_url, file, res.headers ?? {});
        await completeArtifact.mutateAsync(res.artifact.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insertOrUpdateBlock(editor as unknown as Parameters<typeof insertOrUpdateBlock>[0], {
          type: blockType,
          props: { artifactId: res.artifact.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        console.error('Embed upload failed:', msg);
        alert(`Upload failed: ${msg}`);
      }
    },
    [createArtifact, completeArtifact, editor, effectiveProjectIdForUpload]
  );

  // ─── Ref insertion ────────────────────────────────────────────────────────────

  const [refPickerOpen, setRefPickerOpen] = useState<'sample' | 'experiment' | 'artifact' | null>(null);

  const effectiveProjectId = propProjectId ?? pageData?.project_id;
  const { data: samples = [] }   = useProjectSamples(effectiveProjectId);
  const { data: experiments = [] } = useProjectExperiments(effectiveProjectId);
  const { data: artifacts = [] }  = useProjectArtifacts(effectiveProjectId);

  const insertSampleRef = useCallback((sample: Sample) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insertOrUpdateBlock(editor as unknown as Parameters<typeof insertOrUpdateBlock>[0], {
      type: 'sampleRef',
      props: { refId: sample.id, identifier: sample.identifier ?? '', name: sample.name ?? '', kind: sample.kind ?? '', status: sample.status ?? '' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setRefPickerOpen(null);
  }, [editor]);

  const insertExperimentRef = useCallback((exp: Experiment) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insertOrUpdateBlock(editor as unknown as Parameters<typeof insertOrUpdateBlock>[0], {
      type: 'experimentRef',
      props: { refId: exp.id, method: exp.method ?? '', summary: exp.result_summary ?? '', status: exp.status ?? '' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setRefPickerOpen(null);
  }, [editor]);

  const insertArtifactRef = useCallback((art: Artifact) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insertOrUpdateBlock(editor as unknown as Parameters<typeof insertOrUpdateBlock>[0], {
      type: 'artifactRef',
      props: { refId: art.id, filename: art.filename ?? '', contentType: art.content_type ?? '', artType: art.type ?? '' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setRefPickerOpen(null);
  }, [editor]);

  // ─── Slash menu ───────────────────────────────────────────────────────────────

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
      {
        title: 'Artifact reference',
        aliases: ['@artifact', 'artifact ref', 'file ref'],
        group: 'Lab references',
        icon: <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontStyle: 'italic' }}>a</span>,
        subtext: 'Embed an artifact/file card',
        onItemClick: () => setRefPickerOpen('artifact'),
      },
      {
        title: 'Image',
        aliases: ['image embed', 'upload image', 'photo'],
        group: 'Attachments',
        icon: <span style={{ fontSize: 14 }}>🖼</span>,
        subtext: 'Upload and embed an image',
        onItemClick: () => imageFileRef.current?.click(),
      },
      {
        title: 'PDF',
        aliases: ['pdf embed', 'upload pdf', 'document'],
        group: 'Attachments',
        icon: <span style={{ fontSize: 14 }}>📄</span>,
        subtext: 'Upload and embed a PDF',
        onItemClick: () => pdfFileRef.current?.click(),
      },
      {
        title: 'HTML file',
        aliases: ['html embed', 'upload html', 'webpage'],
        group: 'Attachments',
        icon: <span style={{ fontSize: 14 }}>🌐</span>,
        subtext: 'Upload and embed an HTML file (sandboxed)',
        onItemClick: () => htmlFileRef.current?.click(),
      },
    ],
    []
  );

  const getMentionItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const q = query.toLowerCase();
      const sampleItems: DefaultReactSuggestionItem[] = samples
        .filter(s => !q || s.identifier?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q))
        .slice(0, 10)
        .map(s => ({
          title: `${s.identifier ?? ''}${s.name ? ' — ' + s.name : ''}`,
          group: 'Samples',
          subtext: s.kind ?? undefined,
          icon: <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ref-sample-fg)' }}>s</span>,
          onItemClick: () => insertSampleRef(s),
        }));
      const experimentItems: DefaultReactSuggestionItem[] = experiments
        .filter(e => !q || e.method?.toLowerCase().includes(q) || e.id?.toLowerCase().includes(q))
        .slice(0, 10)
        .map(e => ({
          title: e.method ?? e.id.slice(0, 8),
          group: 'Experiments',
          subtext: e.status ?? undefined,
          icon: <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ref-exp-fg)' }}>e</span>,
          onItemClick: () => insertExperimentRef(e),
        }));
      const artifactItems: DefaultReactSuggestionItem[] = artifacts
        .filter(a => !q || a.filename?.toLowerCase().includes(q) || a.type?.toLowerCase().includes(q))
        .slice(0, 10)
        .map(a => ({
          title: a.filename ?? a.id.slice(0, 8),
          group: 'Artifacts',
          subtext: a.type ?? undefined,
          icon: <span style={{ fontSize: 13 }}>📎</span>,
          onItemClick: () => insertArtifactRef(a),
        }));
      return filterSuggestionItems([...sampleItems, ...experimentItems, ...artifactItems], query);
    },
    [samples, experiments, artifacts, insertSampleRef, insertExperimentRef, insertArtifactRef]
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
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
                editor.replaceBlocks(editor.document, blocks as Parameters<typeof editor.replaceBlocks>[1]);
              }
            } catch { /* ignore */ }
            setSaveStatusNotify('saved');
            setIsDirty(false);
          }}
        />
      )}

      {/* Optional toolbar */}
      {showToolbar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}>
          <SaveStatusBadge status={saveStatus} />
          {pageData && enablePresence && <PresenceIndicator pageId={pageId} currentUserId={user?.id ?? ''} />}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="top-btn" onClick={() => setShowHistory(h => !h)} style={{ background: showHistory ? 'var(--paper-2)' : undefined }}>
              History
            </button>
            <button className="top-btn primary" onClick={() => void save('human')} disabled={saveStatus === 'saving'}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* Ref picker modals */}
      {refPickerOpen === 'sample' && (
        <RefPickerModal title="Insert sample reference" onClose={() => setRefPickerOpen(null)}>
          {samples.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No samples in this project.</div>
          ) : (
            samples.map(s => (
              <button key={s.id} className="ref-picker-item" onClick={() => insertSampleRef(s)}>
                <span className="ref-glyph" style={{ color: 'var(--ref-sample-fg)' }}>s</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)' }}>{s.identifier}</span>
                <span style={{ flex: 1 }}>{s.name}</span>
                <span className={`pill k-${s.kind}`} style={{ fontSize: 10 }}>{s.kind}</span>
                <StatusPill status={s.status} />
              </button>
            ))
          )}
        </RefPickerModal>
      )}
      {refPickerOpen === 'experiment' && (
        <RefPickerModal title="Insert experiment reference" onClose={() => setRefPickerOpen(null)}>
          {experiments.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No experiments in this project.</div>
          ) : (
            experiments.map(e => (
              <button key={e.id} className="ref-picker-item" onClick={() => insertExperimentRef(e)}>
                <span className="ref-glyph" style={{ color: 'var(--ref-exp-fg)' }}>e</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{e.id.slice(0, 8)}…</span>
                <span style={{ flex: 1 }}>{e.method}</span>
                <StatusPill status={e.status} />
              </button>
            ))
          )}
        </RefPickerModal>
      )}
      {refPickerOpen === 'artifact' && (
        <RefPickerModal title="Insert artifact reference" onClose={() => setRefPickerOpen(null)}>
          {artifacts.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No artifacts in this project.</div>
          ) : (
            artifacts.map(a => (
              <button key={a.id} className="ref-picker-item" onClick={() => insertArtifactRef(a)}>
                <span className="ref-glyph" style={{ color: 'var(--ref-art-fg)' }}>a</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{a.id.slice(0, 8)}…</span>
                <span style={{ flex: 1 }}>{a.filename}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{a.type}</span>
              </button>
            ))
          )}
        </RefPickerModal>
      )}

      {/* Hidden file inputs for attachment slash-menu items */}
      <input
        ref={imageFileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void runEmbedUpload(file, 'image', 'imageEmbed');
          e.target.value = '';
        }}
      />
      <input
        ref={pdfFileRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void runEmbedUpload(file, 'pdf', 'pdfEmbed');
          e.target.value = '';
        }}
      />
      <input
        ref={htmlFileRef}
        type="file"
        accept="text/html,.html,.htm"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void runEmbedUpload(file, 'other', 'htmlEmbed');
          e.target.value = '';
        }}
      />

      {/* Editor area */}
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
            getItems={async (query: string) => filterSuggestionItems(getCustomItems(editor), query)}
          />
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={getMentionItems}
          />
        </BlockNoteView>
      </EditorBoundary>
    </>
  );
}
