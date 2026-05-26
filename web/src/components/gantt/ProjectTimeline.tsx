/**
 * ProjectTimeline — per-project Gantt tab embedded in ProjectDetailPage.
 *
 * Shows iterations as horizontal bars + events as markers on the same axis.
 * Uses the custom GanttChart component (no premium FullCalendar needed).
 */

import { useState, useMemo } from 'react';
import { useProjectIterations } from '@/hooks/useQueries';
import { useProjectEvents, useCreateEvent, useDeleteEvent } from '@/hooks/useEventQueries';
import { GanttChart, type GanttProjectGroup } from './GanttChart';
import {
  computeRangeForIterations,
  projectColor,
  eventKindColor,
  type DateRange,
} from './ganttUtils';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import type { CalendarEvent, CreateEventBody, EventKind } from '@/api/eventTypes';

// ─── Quick-create event dialog (inline, minimal) ──────────────────────────────

const EVENT_KINDS: EventKind[] = ['deadline', 'milestone_end', 'meeting', 'reminder', 'custom'];

function kindLabel(kind: EventKind): string {
  const labels: Record<EventKind, string> = {
    deadline: 'Deadline',
    milestone_end: 'Milestone',
    meeting: 'Meeting',
    reminder: 'Reminder',
    custom: 'Custom',
  };
  return labels[kind];
}

interface QuickCreateDialogProps {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}

function QuickCreateDialog({ projectId, onClose, onCreated }: QuickCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('custom');
  const [startAt, setStartAt] = useState(new Date().toISOString().slice(0, 16));
  const [allDay, setAllDay] = useState(false);
  const createEvent = useCreateEvent(projectId);

  const handleCreate = async () => {
    if (!title.trim()) return;
    const body: CreateEventBody = {
      kind,
      title: title.trim(),
      start_at: new Date(startAt).toISOString(),
      all_day: allDay,
    };
    await createEvent.mutateAsync(body);
    onCreated();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">New Event</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ gap: 14 }}>
          <div>
            <div style={labelStyle}>Title</div>
            <input
              className="field-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Event title"
              autoFocus
            />
          </div>
          <div>
            <div style={labelStyle}>Kind</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EVENT_KINDS.map(k => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`status-opt${kind === k ? ' sel' : ''}`}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 1,
                        background: eventKindColor(k),
                        display: 'inline-block',
                      }}
                    />
                    {kindLabel(k)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              id="allday-quick"
              checked={allDay}
              onChange={e => setAllDay(e.target.checked)}
            />
            <label htmlFor="allday-quick" style={{ fontSize: 13 }}>All-day</label>
          </div>
          <div>
            <div style={labelStyle}>Date / time</div>
            <input
              className="field-input"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? startAt.slice(0, 10) : startAt}
              onChange={e => setStartAt(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button
            className="top-btn primary"
            onClick={handleCreate}
            disabled={!title.trim() || createEvent.isPending}
          >
            {createEvent.isPending ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10.5,
  color: 'var(--muted-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 6,
};

// ─── Event detail popover ─────────────────────────────────────────────────────

interface EventDetailProps {
  event: CalendarEvent;
  projectId: string;
  onClose: () => void;
}

function EventDetailPopover({ event, projectId, onClose }: EventDetailProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteEvent = useDeleteEvent(projectId);
  const color = eventKindColor(event.kind);

  const handleDelete = async () => {
    await deleteEvent.mutateAsync(event.id);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span className="modal-title">{event.title}</span>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="pill">{kindLabel(event.kind as EventKind)}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {new Date(event.start_at).toLocaleString()}
            {event.end_at && ` → ${new Date(event.end_at).toLocaleString()}`}
          </div>
          {event.description && (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              {event.description}
            </div>
          )}
        </div>
        <div className="modal-foot">
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 'auto' }}>Delete?</span>
              <button
                className="top-btn"
                style={{ color: 'var(--bad)' }}
                onClick={handleDelete}
                disabled={deleteEvent.isPending}
              >
                {deleteEvent.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button className="top-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button
                className="top-btn"
                style={{ color: 'var(--bad)', marginRight: 'auto' }}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
              <button className="top-btn" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ProjectTimelineProps {
  projectId: string;
  projectName: string;
}

export function ProjectTimeline({ projectId, projectName }: ProjectTimelineProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const { data: iterations = [], isLoading: iterLoading, isError: iterError } =
    useProjectIterations(projectId);

  // Compute a range spanning all iterations
  const range = useMemo((): DateRange => {
    const base = computeRangeForIterations(iterations);
    return base;
  }, [iterations]);

  // Timeline range navigation state
  const [displayRange, setDisplayRange] = useState<DateRange | null>(null);
  const activeRange = displayRange ?? range;

  const { data: events = [], isLoading: evtLoading } = useProjectEvents(
    projectId,
    activeRange.start.toISOString(),
    activeRange.end.toISOString(),
  );

  const group = useMemo((): GanttProjectGroup => ({
    projectId,
    projectName,
    projectColor: projectColor(0),
    iterations: [...iterations].sort((a, b) => a.position - b.position),
    events,
  }), [projectId, projectName, iterations, events]);

  const navigate = (months: number) => {
    const base = displayRange ?? range;
    setDisplayRange({
      start: new Date(
        base.start.getFullYear(),
        base.start.getMonth() + months,
        base.start.getDate(),
      ),
      end: new Date(
        base.end.getFullYear(),
        base.end.getMonth() + months,
        base.end.getDate(),
      ),
    });
  };

  const rangeLabel = `${activeRange.start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} → ${activeRange.end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;

  if (iterLoading || evtLoading) return <LoadingState message="Loading timeline…" />;
  if (iterError) return <ErrorState message="Failed to load iterations." />;

  const hasData = iterations.length > 0 || events.length > 0;

  return (
    <div className="page-wrap wide">
      {/* Create event dialog */}
      {createOpen && (
        <QuickCreateDialog
          projectId={projectId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => setCreateOpen(false)}
        />
      )}

      {/* Event detail popover */}
      {selectedEvent && (
        <EventDetailPopover
          event={selectedEvent}
          projectId={projectId}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Header */}
      <div className="section-h" style={{ marginBottom: 14 }}>
        <h2>Timeline</h2>
        <span className="meta">{iterations.length} iterations</span>
        <div className="right">
          <button className="top-btn primary" onClick={() => setCreateOpen(true)}>
            + New event
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button
          className="icon-btn"
          onClick={() => navigate(-3)}
          style={{ fontSize: 14, padding: '4px 8px' }}
        >
          ‹
        </button>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
          {rangeLabel}
        </span>
        <button
          className="icon-btn"
          onClick={() => navigate(3)}
          style={{ fontSize: 14, padding: '4px 8px' }}
        >
          ›
        </button>
        {displayRange && (
          <button
            className="top-btn"
            style={{ fontSize: 11 }}
            onClick={() => setDisplayRange(null)}
          >
            Reset
          </button>
        )}
      </div>

      {!hasData ? (
        <EmptyState message="No iterations or events yet. Create iterations with dates to see them on the timeline." />
      ) : (
        <>
          <GanttChart
            groups={[group]}
            range={activeRange}
            onEventClick={ev => setSelectedEvent(ev)}
            showGroups={false}
          />

          {/* Legend */}
          <div style={{ marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Active', color: 'var(--good)' },
              { label: 'Planned', color: 'var(--info)' },
              { label: 'Done', color: 'var(--muted-2)' },
              { label: 'Blocked', color: 'var(--bad)' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
