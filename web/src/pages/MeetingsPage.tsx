/**
 * MeetingsPage — /meetings
 * Upcoming / past meetings list with a "New meeting" modal.
 */
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { useMeetings, useCreateMeeting } from '@/hooks/useWorkspaceQueries';
import { useCurrentWorkspace } from '@/hooks/useQueries';
import type { Meeting } from '@/hooks/useWorkspaceQueries';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  sync: 'var(--pill-planned-fg)',
  review: 'var(--ember)',
  planning: 'var(--good)',
  retrospective: 'var(--info)',
  kickoff: '#8c3f1f',
};

function kindStyle(kind: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 99,
    fontSize: 10.5,
    fontFamily: 'var(--mono)',
    background: 'var(--paper-2)',
    color: KIND_COLORS[kind] ?? 'var(--muted)',
    border: '1px solid var(--line)',
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function safeLen(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  return 0;
}

// ─── Meeting row ──────────────────────────────────────────────────────────────

function MeetingRow({ meeting }: { meeting: Meeting }) {
  return (
    <Link
      to="/meetings/$meetingId"
      params={{ meetingId: meeting.id }}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr auto auto',
          gap: 16,
          padding: '11px 8px',
          borderBottom: '1px solid var(--line)',
          alignItems: 'center',
          cursor: 'default',
        }}
        className="rec"
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)' }}>
          {fmtDate(meeting.start_at)}
        </div>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 3 }}>{meeting.title}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={kindStyle(meeting.kind)}>{meeting.kind}</span>
            {meeting.chair && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>
                {meeting.chair.slice(0, 8)}…
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
          <span title="Attendees">{safeLen(meeting.attendees)} att.</span>
        </div>
        <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
          <span title="Decisions">{safeLen(meeting.decisions)} dec.</span>
          <span title="Action items">{safeLen(meeting.action_items)} actions</span>
        </div>
      </div>
    </Link>
  );
}

// ─── New meeting modal ────────────────────────────────────────────────────────

interface NewMeetingModalProps {
  workspaceId: string;
  onClose: () => void;
}

function NewMeetingModal({ workspaceId, onClose }: NewMeetingModalProps) {
  const create = useCreateMeeting(workspaceId);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('sync');
  const [startAt, setStartAt] = useState('');
  const [agenda, setAgenda] = useState('');

  const handleCreate = async () => {
    if (!title.trim() || !startAt) return;
    await create.mutateAsync({
      title: title.trim(),
      kind,
      start_at: new Date(startAt).toISOString(),
      agenda,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">New Meeting</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Title
            </div>
            <input
              className="field-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Meeting title"
              autoFocus
            />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Kind
            </div>
            <select className="field-input" value={kind} onChange={e => setKind(e.target.value)}>
              {['sync', 'review', 'planning', 'retrospective', 'kickoff'].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Start
            </div>
            <input
              type="datetime-local"
              className="field-input"
              value={startAt}
              onChange={e => setStartAt(e.target.value)}
            />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Agenda (optional)
            </div>
            <textarea
              className="field-textarea"
              value={agenda}
              onChange={e => setAgenda(e.target.value)}
              rows={3}
              placeholder="Agenda items…"
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button
            className="top-btn primary"
            onClick={() => void handleCreate()}
            disabled={!title.trim() || !startAt || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MeetingsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const { data: meetings = [], isLoading, isError } = useMeetings(workspaceId);
  const [showCreate, setShowCreate] = useState(false);

  const now = Date.now();
  const upcoming = meetings.filter(m => new Date(m.start_at).getTime() >= now);
  const past = meetings.filter(m => new Date(m.start_at).getTime() < now);

  const crumbs = [{ label: 'Meetings' }];
  const actions = (
    <button
      className="top-btn primary"
      onClick={() => setShowCreate(true)}
    >
      + New meeting
    </button>
  );

  return (
    <AppShell topBarCrumbs={crumbs} topBarActions={actions}>
      {showCreate && workspaceId && (
        <NewMeetingModal workspaceId={workspaceId} onClose={() => setShowCreate(false)} />
      )}
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 28px' }}>
          Meetings
        </h1>

        {isLoading && <LoadingState message="Loading meetings…" />}
        {isError && <ErrorState message="Failed to load meetings." />}

        {!isLoading && !isError && meetings.length === 0 && (
          <EmptyState message="No meetings yet." />
        )}

        {!isLoading && !isError && meetings.length > 0 && (
          <>
            {upcoming.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div className="section-h" style={{ marginTop: 0 }}>
                  <h2>Upcoming</h2>
                  <span className="meta">{upcoming.length}</span>
                </div>
                {upcoming.map(m => <MeetingRow key={m.id} meeting={m} />)}
              </div>
            )}
            {past.length > 0 && (
              <div>
                <div className="section-h">
                  <h2>Past</h2>
                  <span className="meta">{past.length}</span>
                </div>
                {past.map(m => <MeetingRow key={m.id} meeting={m} />)}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
