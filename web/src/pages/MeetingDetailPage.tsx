/**
 * MeetingDetailPage — /meetings/$meetingId
 * Header, agenda, decisions, action items, notes. Inline edit of notes/agenda.
 */
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { useMeeting, useUpdateMeeting } from '@/hooks/useWorkspaceQueries';
import { useCurrentWorkspace } from '@/hooks/useQueries';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import type { ActionItem } from '@/hooks/useWorkspaceQueries';
import { resolveUserLabel } from '@/lib/userDisplay';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function kindPill(kind: string) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 9px',
        borderRadius: 99,
        fontSize: 11,
        fontFamily: 'var(--mono)',
        background: 'var(--paper-2)',
        color: 'var(--muted)',
        border: '1px solid var(--line)',
      }}
    >
      {kind}
    </span>
  );
}

// Defensively parse action items
function parseActionItems(raw: unknown): ActionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'string') return { text: item };
    if (typeof item === 'object' && item !== null) return item as ActionItem;
    return { text: String(item) };
  });
}

function parseStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      return String(obj.text ?? obj.title ?? JSON.stringify(item));
    }
    return String(item);
  });
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-2)' }}>
          {title}
        </div>
      </div>
      <div style={{ padding: '16px', background: 'var(--surface)' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Editable textarea section ────────────────────────────────────────────────

interface EditableProps {
  value: string;
  onSave: (v: string) => Promise<void>;
  isPending: boolean;
}

function EditableText({ value, onSave, isPending }: EditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = async () => {
    await onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div>
        <textarea
          className="field-textarea"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={6}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
          <button className="top-btn" onClick={() => { setDraft(value); setEditing(false); }}>Cancel</button>
          <button className="top-btn primary" onClick={() => void handleSave()} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ cursor: 'default', minHeight: 40 }}
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
    >
      {value ? (
        <pre style={{ fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>
          {value}
        </pre>
      ) : (
        <span style={{ color: 'var(--muted-2)', fontStyle: 'italic', fontSize: 13 }}>Click to add…</span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MeetingDetailPage() {
  const { meetingId } = useParams({ from: '/auth/meetings/$meetingId' });
  const { workspaceId } = useCurrentWorkspace();
  const { directory } = useUserDirectory(workspaceId);
  const { data: meeting, isLoading, isError } = useMeeting(meetingId);
  const update = useUpdateMeeting(meetingId, workspaceId ?? '');

  const crumbs = [
    { label: 'Meetings', href: '/meetings' },
    { label: meeting?.title ?? meetingId },
  ];

  if (isLoading) {
    return (
      <AppShell topBarCrumbs={crumbs}>
        <div className="page-wrap" style={{ paddingTop: 28 }}>
          <LoadingState message="Loading meeting…" />
        </div>
      </AppShell>
    );
  }

  if (isError || !meeting) {
    return (
      <AppShell topBarCrumbs={crumbs}>
        <div className="page-wrap" style={{ paddingTop: 28 }}>
          <ErrorState message="Failed to load meeting." />
        </div>
      </AppShell>
    );
  }

  const decisions = parseStrings(meeting.decisions);
  const actionItems = parseActionItems(meeting.action_items);

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {kindPill(meeting.kind)}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)' }}>
              {fmtDate(meeting.start_at)}
              {meeting.end_at && ` → ${new Date(meeting.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 8px' }}>
            {meeting.title}
          </h1>
          {meeting.location && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>
              {meeting.location}
            </div>
          )}
        </div>

        {/* Attendees */}
        {Array.isArray(meeting.attendees) && meeting.attendees.length > 0 && (
          <SectionCard title={`Attendees (${meeting.attendees.length})`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {meeting.attendees.map((att, i) => (
                <span key={i} className="pill">
                  {typeof att === 'string' ? att : JSON.stringify(att)}
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Agenda */}
        <SectionCard title="Agenda">
          <EditableText
            value={meeting.agenda}
            onSave={async v => { await update.mutateAsync({ agenda: v }); }}
            isPending={update.isPending}
          />
        </SectionCard>

        {/* Decisions */}
        {decisions.length > 0 && (
          <SectionCard title={`Decisions (${decisions.length})`}>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {decisions.map((d, i) => (
                <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', marginBottom: 4 }}>{d}</li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* Action items */}
        {actionItems.length > 0 && (
          <SectionCard title={`Action Items (${actionItems.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actionItems.map((ai, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, background: ai.done ? 'var(--paper-2)' : 'var(--surface)' }}>
                  <span style={{ marginTop: 2, color: ai.done ? 'var(--good)' : 'var(--muted-2)', fontSize: 14, flexShrink: 0 }}>
                    {ai.done ? '✓' : '○'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: ai.done ? 'var(--muted)' : 'var(--ink)', textDecoration: ai.done ? 'line-through' : 'none' }}>
                      {ai.text ?? JSON.stringify(ai)}
                    </div>
                    {ai.owner && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginTop: 2 }}>
                        Owner: {resolveUserLabel(directory, ai.owner)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Notes */}
        <SectionCard title="Notes">
          <EditableText
            value={meeting.notes}
            onSave={async v => { await update.mutateAsync({ notes: v }); }}
            isPending={update.isPending}
          />
        </SectionCard>

        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginTop: 8 }}>
          Last updated {new Date(meeting.updated_at).toLocaleString()}
        </div>
      </div>
    </AppShell>
  );
}
