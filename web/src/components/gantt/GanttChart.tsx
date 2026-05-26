/**
 * GanttChart — lightweight custom Gantt/timeline renderer.
 *
 * Renders iteration bars and event markers on a date axis using CSS
 * absolute positioning (no premium FullCalendar timeline needed).
 *
 * Bar position math lives in ganttUtils.ts.
 */

import { useState } from 'react';
import type { Iteration } from '@/api/types';
import type { CalendarEvent } from '@/api/eventTypes';
import {
  barPosition,
  markerPosition,
  todayPosition,
  monthHeaders,
  iterationBarColor,
  eventKindColor,
  type DateRange,
} from './ganttUtils';

// ─── Sub-components ───────────────────────────────────────────────────────────

function MonthGrid({ range }: { range: DateRange }) {
  const headers = monthHeaders(range);
  const todayLeft = todayPosition(range);
  const showToday = todayLeft >= 0 && todayLeft <= 100;

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Month column dividers */}
      {headers.map((h, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${h.left}%`,
            top: 0,
            bottom: 0,
            width: `${h.width}%`,
            borderLeft: i > 0 ? '1px solid var(--line)' : 'none',
            pointerEvents: 'none',
          }}
        />
      ))}
      {/* Today line */}
      {showToday && (
        <div
          style={{
            position: 'absolute',
            left: `${todayLeft}%`,
            top: 0,
            bottom: 0,
            width: 1.5,
            background: 'var(--ember)',
            opacity: 0.6,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}
    </div>
  );
}

interface IterationBarProps {
  iteration: Iteration;
  range: DateRange;
  projectColor?: string;
  onClick?: () => void;
}

function IterationBar({ iteration, range, projectColor, onClick }: IterationBarProps) {
  const [hovered, setHovered] = useState(false);

  if (!iteration.start_at || !iteration.end_at) return null;

  const start = new Date(iteration.start_at);
  const end = new Date(iteration.end_at);
  const { left, width } = barPosition(start, end, range);

  // Clamp to visible area
  if (left > 100 || left + width < 0) return null;

  const color = projectColor ?? iterationBarColor(iteration.status);
  const isDone = iteration.status === 'done';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${Math.max(0, left)}%`,
        width: `${Math.min(width, 100 - Math.max(0, left))}%`,
        top: '50%',
        transform: 'translateY(-50%)',
        height: 22,
        background: isDone ? 'var(--paper-3)' : color,
        border: `1px solid ${isDone ? 'var(--line-2)' : color}`,
        borderRadius: 4,
        opacity: isDone ? 0.7 : 1,
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
        overflow: 'hidden',
        zIndex: 3,
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
        transition: 'box-shadow 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${iteration.title} (${iteration.status})\n${new Date(iteration.start_at).toLocaleDateString()} → ${new Date(iteration.end_at).toLocaleDateString()}`}
    >
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: isDone ? 'var(--muted)' : '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          userSelect: 'none',
        }}
      >
        {iteration.title}
      </span>
    </div>
  );
}

interface EventMarkerProps {
  event: CalendarEvent;
  range: DateRange;
  onClick?: () => void;
}

function EventMarker({ event, range, onClick }: EventMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const date = new Date(event.start_at);
  const left = markerPosition(date, range);
  if (left < 0 || left > 100) return null;

  const color = eventKindColor(event.kind);
  const isDl = event.kind === 'deadline';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: isDl ? 10 : 8,
        height: isDl ? 10 : 8,
        background: color,
        borderRadius: isDl ? 2 : '50%',
        rotate: isDl ? '45deg' : '0deg',
        border: '1.5px solid var(--surface)',
        cursor: 'default',
        zIndex: 5,
        boxShadow: hovered ? `0 0 0 3px ${color}33` : 'none',
        transition: 'box-shadow 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${event.title} (${event.kind})\n${new Date(event.start_at).toLocaleString()}`}
    />
  );
}

// ─── Month header row ─────────────────────────────────────────────────────────

function MonthHeaderRow({ range }: { range: DateRange }) {
  const headers = monthHeaders(range);
  return (
    <div style={{ display: 'flex', width: '100%' }}>
      {headers.map((h, i) => (
        <div
          key={i}
          style={{
            width: `${h.width}%`,
            flexShrink: 0,
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '4px 4px',
            borderLeft: i > 0 ? '1px solid var(--line)' : 'none',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {h.label}
        </div>
      ))}
    </div>
  );
}

// ─── Undated lane ────────────────────────────────────────────────────────────

interface UndatedRowProps {
  label: string;
  projectColor?: string;
}

function UndatedRow({ label, projectColor }: UndatedRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--line)',
        minHeight: 36,
        alignItems: 'center',
        opacity: 0.6,
      }}
    >
      <div
        style={{
          width: 200,
          flexShrink: 0,
          padding: '6px 12px',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          borderRight: '1px solid var(--line)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--muted-2)',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: projectColor ?? 'var(--muted-2)',
            flexShrink: 0,
          }}
        />
        no dates set
      </div>
    </div>
  );
}

// ─── Single iteration row ────────────────────────────────────────────────────

interface IterationRowProps {
  iteration: Iteration;
  events: CalendarEvent[];
  range: DateRange;
  projectColor?: string;
  onEventClick?: (ev: CalendarEvent) => void;
  onIterationClick?: (it: Iteration) => void;
}

function IterationRow({
  iteration,
  events,
  range,
  projectColor,
  onEventClick,
  onIterationClick,
}: IterationRowProps) {
  const hasDate = !!(iteration.start_at && iteration.end_at);
  const barColor = projectColor ?? iterationBarColor(iteration.status);

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--line)',
        minHeight: 36,
        alignItems: 'stretch',
      }}
    >
      {/* Label */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          padding: '6px 12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          borderRight: '1px solid var(--line)',
          cursor: 'default',
          gap: 2,
        }}
        title={iteration.title}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: barColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ink-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {iteration.title}
          </span>
        </div>
        {!hasDate && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: 'var(--muted-2)',
              paddingLeft: 12,
            }}
          >
            undated
          </span>
        )}
      </div>

      {/* Track */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <MonthGrid range={range} />
        {hasDate && (
          <IterationBar
            iteration={iteration}
            range={range}
            projectColor={projectColor}
            onClick={() => onIterationClick?.(iteration)}
          />
        )}
        {events.map(ev => (
          <EventMarker
            key={ev.id}
            event={ev}
            range={range}
            onClick={() => onEventClick?.(ev)}
          />
        ))}
        {!hasDate && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 12,
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--muted-2)',
            }}
          >
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Project group header ─────────────────────────────────────────────────────

interface GroupHeaderProps {
  projectName: string;
  projectColor: string;
  iterCount: number;
  range: DateRange;
}

function GroupHeader({ projectName, projectColor, iterCount, range }: GroupHeaderProps) {
  const todayLeft = todayPosition(range);
  const showToday = todayLeft >= 0 && todayLeft <= 100;

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--line)',
        minHeight: 34,
        alignItems: 'stretch',
        background: 'var(--paper-2)',
      }}
    >
      {/* Label */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderRight: '1px solid var(--line)',
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: projectColor,
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--serif)',
            fontSize: 11,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {projectName[0]?.toUpperCase()}
        </div>
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {projectName}
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--muted-2)',
            flexShrink: 0,
          }}
        >
          {iterCount}
        </span>
      </div>

      {/* Track (just gridlines + today) */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <MonthGrid range={range} />
        {showToday && (
          <div
            style={{
              position: 'absolute',
              left: `${todayLeft}%`,
              top: 0,
              bottom: 0,
              width: 1.5,
              background: 'var(--ember)',
              opacity: 0.4,
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main GanttChart component ────────────────────────────────────────────────

export interface GanttProjectGroup {
  projectId: string;
  projectName: string;
  projectColor: string;
  iterations: Iteration[];
  events: CalendarEvent[];
}

export interface GanttChartProps {
  groups: GanttProjectGroup[];
  range: DateRange;
  onEventClick?: (ev: CalendarEvent) => void;
  onIterationClick?: (it: Iteration) => void;
  /** If true, show project group headers (unified view). If false, just rows (single project). */
  showGroups?: boolean;
}

export function GanttChart({
  groups,
  range,
  onEventClick,
  onIterationClick,
  showGroups = true,
}: GanttChartProps) {
  if (groups.length === 0) {
    return (
      <div
        style={{
          padding: '40px 24px',
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        No iterations to display.
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
    >
      {/* Header: label col + month columns */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--line-2)',
          background: 'var(--paper)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 200,
            flexShrink: 0,
            padding: '6px 12px',
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            borderRight: '1px solid var(--line)',
          }}
        >
          {showGroups ? 'Project / Iteration' : 'Iteration'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MonthHeaderRow range={range} />
        </div>
      </div>

      {/* Rows */}
      {groups.map(group => (
        <div key={group.projectId}>
          {showGroups && (
            <GroupHeader
              projectName={group.projectName}
              projectColor={group.projectColor}
              iterCount={group.iterations.length}
              range={range}
            />
          )}
          {group.iterations.map(it => {
            const iterEvents = group.events.filter(
              ev => ev.iteration_id === it.id,
            );

            if (!it.start_at || !it.end_at) {
              return (
                <UndatedRow
                  key={it.id}
                  label={it.title}
                  projectColor={group.projectColor}
                />
              );
            }

            return (
              <IterationRow
                key={it.id}
                iteration={it}
                events={iterEvents}
                range={range}
                projectColor={group.projectColor}
                onEventClick={onEventClick}
                onIterationClick={onIterationClick}
              />
            );
          })}
          {/* Events not linked to an iteration */}
          {(() => {
            const unlinkedEvents = group.events.filter(ev => !ev.iteration_id);
            if (unlinkedEvents.length === 0) return null;
            return (
              <IterationRow
                key={`${group.projectId}-unlinked`}
                iteration={{
                  id: `${group.projectId}-unlinked`,
                  project_id: group.projectId,
                  title: 'Project events',
                  status: 'active',
                  position: -1,
                  description: '',
                  start_at: range.start.toISOString(),
                  end_at: range.end.toISOString(),
                  created_at: '',
                  updated_at: '',
                  created_by: '',
                }}
                events={unlinkedEvents}
                range={range}
                projectColor={group.projectColor}
                onEventClick={onEventClick}
              />
            );
          })()}
        </div>
      ))}
    </div>
  );
}
