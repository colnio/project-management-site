/**
 * CalendarPage — E3 + E4 unified calendar and timeline.
 *
 * Route: /calendar
 *
 * Three view modes toggled via top bar:
 *   - "calendar"  → FullCalendar month/week/agenda
 *   - "timeline"  → Custom Gantt/bar chart (all projects)
 *
 * Scope selector: "All projects" or a single project.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, DateSelectArg } from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import { AppShell } from '@/components/AppShell';
import { LoadingState } from '@/components/LoadingState';
import { GanttChart, type GanttProjectGroup } from '@/components/gantt/GanttChart';
import { CalendarSubscriptionPanel } from '@/components/CalendarSubscriptionPanel';
import {
  useAllProjectsEvents,
  useProjectEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useAllProjectsIterations,
} from '@/hooks/useEventQueries';
import { api } from '@/api/client';
import { useWorkspaces, keys as queryKeys } from '@/hooks/useQueries';
import {
  projectColor,
  eventKindColor,
  type DateRange,
} from '@/components/gantt/ganttUtils';
import type { CalendarEvent, EventKind, CreateEventBody, UpdateEventBody } from '@/api/eventTypes';
import type { Project } from '@/api/types';

// ─── CSS for FullCalendar overrides ──────────────────────────────────────────
// (Imported in main.tsx or here inline via style injection)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVENT_KINDS: EventKind[] = ['deadline', 'milestone_end', 'meeting', 'reminder', 'custom'];

function kindLabel(kind: EventKind): string {
  const labels: Record<EventKind, string> = {
    deadline: 'Deadline',
    milestone_end: 'Milestone',
    meeting: 'Meeting',
    reminder: 'Reminder',
    custom: 'Custom',
  };
  return labels[kind] ?? kind;
}

/** Convert CalendarEvent to FullCalendar EventInput. */
function toFCEvent(ev: CalendarEvent, projectName?: string) {
  return {
    id: ev.id,
    title: ev.title,
    start: ev.start_at,
    end: ev.end_at,
    allDay: ev.all_day,
    backgroundColor: eventKindColor(ev.kind),
    borderColor: eventKindColor(ev.kind),
    extendedProps: { event: ev, projectName },
  };
}

// ─── Event Detail Modal ───────────────────────────────────────────────────────

interface EventDetailModalProps {
  event: CalendarEvent;
  projectName?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function EventDetailModal({
  event,
  projectName,
  onClose,
  onEdit,
  onDelete,
  isDeleting,
}: EventDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const kindColor = eventKindColor(event.kind);

  const formatTime = (iso: string, allDay: boolean) => {
    const d = new Date(iso);
    if (allDay) return d.toLocaleDateString();
    return d.toLocaleString();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: kindColor,
                flexShrink: 0,
              }}
            />
            <span className="modal-title">{event.title}</span>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ gap: 14 }}>
          {/* Kind pill */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="pill"
              style={{
                background: `${kindColor}22`,
                color: kindColor,
                borderColor: `${kindColor}44`,
              }}
            >
              {kindLabel(event.kind)}
            </span>
            {projectName && (
              <span className="pill">{projectName}</span>
            )}
          </div>

          {/* Time */}
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: 4,
              }}
            >
              Time
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink)' }}>
              {formatTime(event.start_at, event.all_day)}
              {event.end_at && ` → ${formatTime(event.end_at, event.all_day)}`}
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--muted-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  marginBottom: 4,
                }}
              >
                Description
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                {event.description}
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 'auto' }}>
                Delete this event?
              </span>
              <button
                className="top-btn"
                style={{ color: 'var(--bad)' }}
                onClick={onDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button className="top-btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
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
              <button className="top-btn" onClick={onEdit}>
                Edit
              </button>
              <button className="top-btn" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create/Edit Event Dialog ─────────────────────────────────────────────────

interface EventFormDialogProps {
  /** When set, we're editing (pre-populate). Otherwise creating. */
  editingEvent?: CalendarEvent;
  /** Pre-set start date from a date click. */
  defaultStart?: string;
  /** Project to post to (required for create). Can be undefined in unified scope. */
  projectId?: string;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}

function EventFormDialog({
  editingEvent,
  defaultStart,
  projectId: initialProjectId,
  projects,
  onClose,
  onSaved,
}: EventFormDialogProps) {
  const isEdit = !!editingEvent;
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId ?? editingEvent?.project_id ?? projects[0]?.id ?? '',
  );
  const [title, setTitle] = useState(editingEvent?.title ?? '');
  const [kind, setKind] = useState<EventKind>(editingEvent?.kind ?? 'custom');
  const [description, setDescription] = useState(editingEvent?.description ?? '');
  const [startAt, setStartAt] = useState(
    editingEvent?.start_at
      ? editingEvent.start_at.slice(0, 16)
      : defaultStart?.slice(0, 16) ?? new Date().toISOString().slice(0, 16),
  );
  const [endAt, setEndAt] = useState(editingEvent?.end_at?.slice(0, 16) ?? '');
  const [allDay, setAllDay] = useState(editingEvent?.all_day ?? false);

  const createEvent = useCreateEvent(selectedProjectId);
  const updateEvent = useUpdateEvent(editingEvent?.id ?? '', editingEvent?.project_id ?? selectedProjectId);

  const handleSubmit = async () => {
    if (!title.trim()) return;

    const body: CreateEventBody | UpdateEventBody = {
      kind,
      title: title.trim(),
      description: description.trim() || undefined,
      start_at: new Date(startAt).toISOString(),
      end_at: endAt ? new Date(endAt).toISOString() : undefined,
      all_day: allDay,
    };

    if (isEdit) {
      await updateEvent.mutateAsync(body as UpdateEventBody);
    } else {
      await createEvent.mutateAsync(body as CreateEventBody);
    }
    onSaved();
  };

  const isPending = createEvent.isPending || updateEvent.isPending;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{isEdit ? 'Edit Event' : 'New Event'}</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ gap: 16 }}>
          {/* Project (only for create in unified mode) */}
          {!isEdit && !initialProjectId && projects.length > 1 && (
            <div>
              <div style={labelStyle}>Project</div>
              <select
                className="field-input"
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
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

          {/* Kind */}
          <div>
            <div style={labelStyle}>Kind</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EVENT_KINDS.map(k => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`status-opt${kind === k ? ' sel' : ''}`}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 12,
                    }}
                  >
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

          {/* All-day toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              id="allday"
              checked={allDay}
              onChange={e => setAllDay(e.target.checked)}
            />
            <label htmlFor="allday" style={{ fontSize: 13, cursor: 'default' }}>
              All-day event
            </label>
          </div>

          {/* Start */}
          <div>
            <div style={labelStyle}>Start</div>
            <input
              className="field-input"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? startAt.slice(0, 10) : startAt}
              onChange={e => setStartAt(e.target.value)}
            />
          </div>

          {/* End */}
          <div>
            <div style={labelStyle}>End (optional)</div>
            <input
              className="field-input"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? endAt.slice(0, 10) : endAt}
              onChange={e => setEndAt(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <div style={labelStyle}>Description</div>
            <textarea
              className="field-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional notes…"
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button
            className="top-btn primary"
            onClick={handleSubmit}
            disabled={!title.trim() || isPending}
          >
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
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

// ─── Unified workspace/project loader hook ────────────────────────────────────

function useAllProjects() {
  const { data: workspaces = [] } = useWorkspaces();

  // useQueries handles any number of workspaces without violating rules-of-hooks.
  const projectResults = useQueries({
    queries: workspaces.map(ws => ({
      queryKey: queryKeys.projects(ws.id),
      queryFn: () =>
        api.get<Project[] | null>(`/v1/workspaces/${ws.id}/projects`).then(r => r ?? []),
      enabled: !!ws.id,
    })),
  });

  const projectsByWorkspace = useMemo(() => {
    const map = new Map<string, Project[]>();
    workspaces.forEach((ws, i) => {
      const data = projectResults[i]?.data;
      if (data) map.set(ws.id, data);
    });
    return map;
  }, [workspaces, projectResults]);

  const allProjects = useMemo(() => {
    const seen = new Set<string>();
    const out: Project[] = [];
    for (const projs of projectsByWorkspace.values()) {
      for (const p of projs) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        }
      }
    }
    return out;
  }, [projectsByWorkspace]);

  return { workspaces, projectsByWorkspace, allProjects };
}

// ─── Calendar view (FullCalendar) ─────────────────────────────────────────────

interface CalendarViewProps {
  fcEvents: ReturnType<typeof toFCEvent>[];
  onEventClick: (info: EventClickArg) => void;
  onDateClick: (info: DateClickArg) => void;
  onDateSelect: (info: DateSelectArg) => void;
  onRangeChange: (start: Date, end: Date) => void;
}

function CalendarView({
  fcEvents,
  onEventClick,
  onDateClick,
  onDateSelect,
  onRangeChange,
}: CalendarViewProps) {
  return (
    <div className="fc-wrapper">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,listMonth',
        }}
        events={fcEvents}
        eventClick={onEventClick}
        dateClick={onDateClick}
        selectable
        select={onDateSelect}
        height="auto"
        datesSet={info => onRangeChange(info.start, info.end)}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false,
        }}
      />
    </div>
  );
}

// ─── Timeline view (Gantt) ────────────────────────────────────────────────────

interface TimelineViewProps {
  groups: GanttProjectGroup[];
  range: DateRange;
  onEventClick: (ev: CalendarEvent) => void;
  onRangeChange: (start: Date, end: Date) => void;
}

function TimelineView({ groups, range, onEventClick, onRangeChange }: TimelineViewProps) {
  // Navigation
  const navigate = (months: number) => {
    const newStart = new Date(range.start);
    newStart.setMonth(newStart.getMonth() + months);
    const newEnd = new Date(range.end);
    newEnd.setMonth(newEnd.getMonth() + months);
    onRangeChange(newStart, newEnd);
  };

  const rangeLabel = `${range.start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} → ${range.end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;

  return (
    <div>
      {/* Timeline nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <button
          className="icon-btn"
          onClick={() => navigate(-3)}
          style={{ fontSize: 14, padding: '4px 8px' }}
          title="Back 3 months"
        >
          ‹
        </button>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted)',
          }}
        >
          {rangeLabel}
        </span>
        <button
          className="icon-btn"
          onClick={() => navigate(3)}
          style={{ fontSize: 14, padding: '4px 8px' }}
          title="Forward 3 months"
        >
          ›
        </button>
      </div>

      <GanttChart
        groups={groups}
        range={range}
        onEventClick={onEventClick}
        showGroups
      />

      {/* Legend */}
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Status:
        </span>
        {[
          { label: 'Active', color: 'var(--good)' },
          { label: 'Planned', color: 'var(--info)' },
          { label: 'Done', color: 'var(--muted-2)' },
          { label: 'Blocked', color: 'var(--bad)' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: item.color,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.label}</span>
          </div>
        ))}
        <span
          style={{
            marginLeft: 12,
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Events:
        </span>
        {(['deadline', 'milestone_end', 'meeting', 'reminder'] as const).map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{
                width: k === 'deadline' ? 8 : 7,
                height: k === 'deadline' ? 8 : 7,
                borderRadius: k === 'deadline' ? 1 : '50%',
                rotate: k === 'deadline' ? '45deg' : undefined,
                background: eventKindColor(k),
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{kindLabel(k)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Calendar Subscription collapsible panel ─────────────────────────────────

function CollapsibleSubscription() {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 24,
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '10px 16px',
          background: open ? 'var(--paper-2)' : 'var(--surface)',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: 'var(--muted-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          textAlign: 'left',
          borderBottom: open ? '1px solid var(--line)' : 'none',
        }}
      >
        <span style={{ flex: 1 }}>Subscribe to calendar (.ics)</span>
        <span
          style={{
            fontSize: 14,
            color: 'var(--muted)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            display: 'inline-block',
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div style={{ padding: '18px 20px', background: 'var(--surface)' }}>
          <CalendarSubscriptionPanel />
        </div>
      )}
    </div>
  );
}

// ─── CalendarPage ─────────────────────────────────────────────────────────────

type ViewMode = 'calendar' | 'timeline';

export function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [scopeProjectId, setScopeProjectId] = useState<string | 'all'>('all');
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDefaultStart, setCreateDefaultStart] = useState<string | undefined>();

  const now = new Date();
  const [fcRange, setFcRange] = useState<{ from: string; to: string }>({
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    to: new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString(),
  });

  const { workspaces, projectsByWorkspace, allProjects } = useAllProjects();

  // Timeline range
  const [timelineRange, setTimelineRange] = useState<DateRange>({
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    end: new Date(now.getFullYear(), now.getMonth() + 7, 1),
  });

  // ── Events (unified or single project) ──────────────────────────────────────

  const {
    data: unifiedEvents,
    isLoading: unifiedLoading,
  } = useAllProjectsEvents(
    workspaces,
    projectsByWorkspace,
    fcRange.from,
    fcRange.to,
  );

  const { data: singleEvents = [], isLoading: singleLoading } = useProjectEvents(
    scopeProjectId !== 'all' ? scopeProjectId : undefined,
    fcRange.from,
    fcRange.to,
  );

  // ── Iterations (for timeline) ─────────────────────────────────────────────

  const {
    results: allIterResults,
    isLoading: iterLoading,
    allProjects: allIterProjects,
  } = useAllProjectsIterations(workspaces, projectsByWorkspace);

  // ── Build FullCalendar events ─────────────────────────────────────────────

  const fcEvents = useMemo(() => {
    const projectMap = new Map(allProjects.map(p => [p.id, p.name]));
    const events = scopeProjectId === 'all' ? unifiedEvents : singleEvents;
    return events.map(ev => toFCEvent(ev, projectMap.get(ev.project_id)));
  }, [scopeProjectId, unifiedEvents, singleEvents, allProjects]);

  // ── Build Gantt groups ─────────────────────────────────────────────────────

  const ganttGroups = useMemo((): GanttProjectGroup[] => {
    const projectsToShow =
      scopeProjectId === 'all'
        ? allIterProjects
        : allIterProjects.filter(p => p.id === scopeProjectId);

    return projectsToShow.map((p, i) => {
      const idx = allIterProjects.indexOf(p);
      const iterResult = allIterResults[idx];
      const iterations = (iterResult?.data ?? []) as import('@/api/types').Iteration[];

      // Filter events to this project
      const projectEvents =
        scopeProjectId === 'all'
          ? unifiedEvents.filter(ev => ev.project_id === p.id)
          : singleEvents.filter(ev => ev.project_id === p.id);

      return {
        projectId: p.id,
        projectName: p.name,
        projectColor: projectColor(i),
        iterations: [...iterations].sort((a, b) => a.position - b.position),
        events: projectEvents,
      };
    });
  }, [scopeProjectId, allIterProjects, allIterResults, unifiedEvents, singleEvents]);

  // ── Mutations for the displayed event ─────────────────────────────────────

  const deleteEventMut = useDeleteEvent(detailEvent?.project_id ?? '');

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFCEventClick = useCallback((info: EventClickArg) => {
    const ev = info.event.extendedProps.event as CalendarEvent;
    setDetailEvent(ev);
  }, []);

  const handleDateClick = useCallback((info: DateClickArg) => {
    setCreateDefaultStart(info.date.toISOString());
    setCreateDialogOpen(true);
  }, []);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    setCreateDefaultStart(info.startStr);
    setCreateDialogOpen(true);
  }, []);

  const handleRangeChange = useCallback((start: Date, end: Date) => {
    setFcRange({
      from: start.toISOString(),
      to: end.toISOString(),
    });
  }, []);

  const handleGanttEventClick = useCallback((ev: CalendarEvent) => {
    setDetailEvent(ev);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!detailEvent) return;
    await deleteEventMut.mutateAsync(detailEvent.id);
    setDetailEvent(null);
  }, [detailEvent, deleteEventMut]);

  const isLoading = scopeProjectId === 'all' ? unifiedLoading : singleLoading;

  const selectedProjectForCreate =
    scopeProjectId !== 'all' ? scopeProjectId : undefined;

  return (
    <AppShell
      topBarCrumbs={[{ label: 'Calendar' }]}
      topBarActions={
        <button
          className="top-btn primary"
          onClick={() => {
            setCreateDefaultStart(undefined);
            setCreateDialogOpen(true);
          }}
        >
          + New event
        </button>
      }
    >
      {/* Modals */}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          projectName={allProjects.find(p => p.id === detailEvent.project_id)?.name}
          onClose={() => setDetailEvent(null)}
          onEdit={() => {
            setEditingEvent(detailEvent);
            setDetailEvent(null);
          }}
          onDelete={handleDelete}
          isDeleting={deleteEventMut.isPending}
        />
      )}

      {(editingEvent || createDialogOpen) && (
        <EventFormDialog
          editingEvent={editingEvent ?? undefined}
          defaultStart={createDefaultStart}
          projectId={editingEvent?.project_id ?? selectedProjectForCreate}
          projects={allProjects}
          onClose={() => {
            setEditingEvent(null);
            setCreateDialogOpen(false);
          }}
          onSaved={() => {
            setEditingEvent(null);
            setCreateDialogOpen(false);
          }}
        />
      )}

      <div className="page-wrap wide">
        {/* Page header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 26,
              fontWeight: 400,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
            }}
          >
            {viewMode === 'calendar' ? 'Calendar' : 'Timeline'}
          </h1>

          {/* View toggle */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              border: '1px solid var(--line)',
              borderRadius: 6,
              overflow: 'hidden',
              marginLeft: 8,
            }}
          >
            {(['calendar', 'timeline'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '5px 12px',
                  fontSize: 12.5,
                  background: viewMode === mode ? 'var(--ink)' : 'transparent',
                  color: viewMode === mode ? 'var(--paper)' : 'var(--muted)',
                  borderRight: mode === 'calendar' ? '1px solid var(--line)' : 'none',
                }}
              >
                {mode === 'calendar' ? 'Calendar' : 'Timeline'}
              </button>
            ))}
          </div>

          {/* Scope selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Scope
            </span>
            <select
              className="field-input"
              style={{ width: 'auto', minWidth: 160, padding: '4px 8px', fontSize: 12.5 }}
              value={scopeProjectId}
              onChange={e => setScopeProjectId(e.target.value)}
            >
              <option value="all">All projects</option>
              {allProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main content */}
        {isLoading && viewMode === 'calendar' ? (
          <LoadingState message="Loading events…" />
        ) : viewMode === 'calendar' ? (
          <CalendarView
            fcEvents={fcEvents}
            onEventClick={handleFCEventClick}
            onDateClick={handleDateClick}
            onDateSelect={handleDateSelect}
            onRangeChange={handleRangeChange}
          />
        ) : iterLoading ? (
          <LoadingState message="Loading timeline…" />
        ) : (
          <TimelineView
            groups={ganttGroups}
            range={timelineRange}
            onEventClick={handleGanttEventClick}
            onRangeChange={(start, end) => setTimelineRange({ start, end })}
          />
        )}

        {/* .ics subscription — collapsible secondary panel */}
        <CollapsibleSubscription />
      </div>
    </AppShell>
  );
}
