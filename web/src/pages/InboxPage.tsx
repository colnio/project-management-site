/**
 * InboxPage — /inbox
 * Groups inbox items into Today / Earlier / Older; filter chips by kind.
 */
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { useInbox } from '@/hooks/useWorkspaceQueries';
import { useCurrentWorkspace } from '@/hooks/useQueries';
import type { InboxItem } from '@/hooks/useWorkspaceQueries';
import { useDecideApprovalRequest, useApprovalComments } from '@/hooks/useApprovalQueries';
import { ApprovalCommentThread } from '@/components/ApprovalCommentThread';
import { safeAppPath } from '@/lib/safeAppPath';

// ─── Kind config ──────────────────────────────────────────────────────────────

const KIND_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pi_flag: { label: 'PI Flag', color: '#9a2a1e', bg: '#fce8e4' },
  ai_proposal: { label: 'AI Proposal', color: '#2c5b6a', bg: '#e6eef0' },
  action_item: { label: 'Action Item', color: '#3f6022', bg: '#eef4e6' },
  comment: { label: 'Comment', color: '#5a503a', bg: '#f4f0e6' },
  system: { label: 'System', color: 'var(--muted)', bg: 'var(--paper-2)' },
  mention: { label: 'Mention', color: '#5a3e7a', bg: '#eae2ef' },
  approval: { label: 'Approval', color: '#1a4d8a', bg: '#e2ecf8' },
};

const ALL_KINDS = Object.keys(KIND_CONFIG);

function kindConfig(kind: string) {
  return KIND_CONFIG[kind] ?? { label: kind, color: 'var(--muted)', bg: 'var(--paper-2)' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function bucketOf(iso: string): 'today' | 'earlier' | 'older' {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'earlier';
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (d >= weekAgo) return 'earlier';
  return 'older';
}

// ─── Comment count badge (fetches eagerly for approval items) ────────────────

function ApprovalCommentCount({ requestId }: { requestId: string }) {
  const { data: comments = [] } = useApprovalComments(requestId);
  if (comments.length === 0) return null;
  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        color: 'var(--muted)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {comments.length} comment{comments.length !== 1 ? 's' : ''}
    </span>
  );
}

// ─── Approve / Reject buttons (approval kind only) ───────────────────────────

function ApprovalActions({ itemId }: { itemId: string }) {
  const decide = useDecideApprovalRequest();
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null);

  if (decided) {
    return (
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: decided === 'approved' ? 'var(--good)' : 'var(--bad)',
          flexShrink: 0,
        }}
      >
        {decided === 'approved' ? 'Approved' : 'Rejected'}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <button
        className="top-btn"
        style={{ fontSize: 11, color: 'var(--good)', padding: '2px 10px' }}
        disabled={decide.isPending}
        onClick={(e) => {
          e.stopPropagation();
          decide.mutate(
            { requestId: itemId, approve: true },
            { onSuccess: () => setDecided('approved') },
          );
        }}
      >
        Approve
      </button>
      <button
        className="top-btn"
        style={{ fontSize: 11, color: 'var(--bad)', padding: '2px 10px' }}
        disabled={decide.isPending}
        onClick={(e) => {
          e.stopPropagation();
          decide.mutate(
            { requestId: itemId, approve: false },
            { onSuccess: () => setDecided('rejected') },
          );
        }}
      >
        Reject
      </button>
    </div>
  );
}

// ─── Item row ──────────────────────────────────────────────────────────────────

function InboxRow({ item }: { item: InboxItem }) {
  const cfg = kindConfig(item.kind);
  const isApproval = item.kind === 'approval';
  const [expanded, setExpanded] = useState(false);

  const header = (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '11px 4px',
        borderBottom: expanded ? 'none' : '1px solid var(--line)',
        cursor: isApproval ? 'pointer' : (item.link ? 'pointer' : undefined),
      }}
      onClick={isApproval ? () => setExpanded(v => !v) : undefined}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 7px',
          borderRadius: 99,
          fontSize: 10.5,
          fontFamily: 'var(--mono)',
          background: cfg.bg,
          color: cfg.color,
          border: '1px solid transparent',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {cfg.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </div>
        {item.body && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.body}
          </div>
        )}
      </div>
      {isApproval ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <ApprovalCommentCount requestId={item.id} />
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--muted-2)',
              whiteSpace: 'nowrap',
            }}
          >
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      ) : (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 3 }}>
          {relativeTime(item.created_at)}
        </span>
      )}
    </div>
  );

  if (isApproval) {
    return (
      <div style={{ borderBottom: '1px solid var(--line)' }}>
        {header}
        {expanded && (
          <div style={{ padding: '0 4px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <ApprovalActions itemId={item.id} />
            </div>
            <ApprovalCommentThread requestId={item.id} />
          </div>
        )}
      </div>
    );
  }

  const safeLink = item.link ? safeAppPath(item.link) : null;
  if (safeLink) {
    return <a href={safeLink}>{header}</a>;
  }
  return header;
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ label, items }: { label: string; items: InboxItem[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-2)', marginBottom: 4 }}>
        {label}
      </div>
      {items.map(it => <InboxRow key={it.id} item={it} />)}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function InboxPage() {
  const { workspaceId } = useCurrentWorkspace();
  const { data: items = [], isLoading, isError } = useInbox(workspaceId);
  const [activeKind, setActiveKind] = useState<string | null>(null);

  const crumbs = [{ label: 'Inbox' }];

  const filtered = activeKind ? items.filter(i => i.kind === activeKind) : items;
  const today = filtered.filter(i => bucketOf(i.created_at) === 'today');
  const earlier = filtered.filter(i => bucketOf(i.created_at) === 'earlier');
  const older = filtered.filter(i => bucketOf(i.created_at) === 'older');

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: 0 }}>
            Inbox
          </h1>
          {!isLoading && !isError && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)' }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          <button
            className={`status-opt${activeKind === null ? ' sel' : ''}`}
            onClick={() => setActiveKind(null)}
            style={{ fontSize: 11.5 }}
          >
            All
          </button>
          {ALL_KINDS.map(k => {
            const count = items.filter(i => i.kind === k).length;
            if (count === 0) return null;
            return (
              <button
                key={k}
                className={`status-opt${activeKind === k ? ' sel' : ''}`}
                onClick={() => setActiveKind(activeKind === k ? null : k)}
                style={{ fontSize: 11.5 }}
              >
                {kindConfig(k).label}
                <span style={{ marginLeft: 4, fontFamily: 'var(--mono)', fontSize: 10 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {isLoading && <LoadingState message="Loading inbox…" />}
        {isError && <ErrorState message="Failed to load inbox." />}

        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState message="No inbox items." />
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <>
            <Section label="Today" items={today} />
            <Section label="Earlier" items={earlier} />
            <Section label="Older" items={older} />
          </>
        )}
      </div>
    </AppShell>
  );
}
