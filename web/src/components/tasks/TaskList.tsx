/**
 * TaskList — table view of tasks.
 * Mirrors RiskRegister table markup and class conventions.
 */
import { useState } from 'react';
import { StatusPill } from '@/components/StatusPill';
import { Avatar } from '@/components/Avatar';
import { isDelayed, useMarkDone, type Task } from '@/hooks/useTaskQueries';
import type { MemberView } from '@/hooks/useWorkspaceQueries';
import { memberLabel } from '@/lib/userDisplay';
import { fmtDate } from '@/lib/formatDate';
import { EmptyState } from '@/components/LoadingState';
import {
  TakeTaskDialog,
  ReassignDialog,
  CancelDialog,
  ReopenDialog,
  DelayDialog,
} from './TaskActionDialogs';

const DELAYED_BADGE: React.CSSProperties = {
  background: 'var(--warn, #d97706)',
  color: '#fff',
  borderRadius: 999,
  fontSize: 11,
  padding: '1px 7px',
  marginLeft: 6,
  fontFamily: 'var(--mono)',
};

type SortKey = 'seq' | 'title' | 'status' | 'assignee' | 'planned_start_at' | 'estimated_finish_at';

type Dialog = 'take' | 'reassign' | 'cancel' | 'reopen' | 'delay' | null;

interface TaskRowProps {
  task: Task;
  projectId: string;
  members: MemberView[];
  onOpen: (id: string) => void;
}

function TaskRow({ task, projectId, members, onOpen }: TaskRowProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const markDone = useMarkDone(task.id, projectId);
  const delayed = isDelayed(task);

  const assignee = task.assignee_user_id
    ? members.find(m => m.user_id === task.assignee_user_id)
    : null;
  const assigneeName = assignee ? memberLabel(assignee) : null;

  const { status } = task;

  return (
    <>
      <tr
        style={{
          borderBottom: '1px solid var(--line)',
          cursor: 'pointer',
        }}
        onClick={() => onOpen(task.id)}
      >
        {/* # */}
        <td
          style={{
            padding: '10px 12px',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            verticalAlign: 'middle',
          }}
        >
          #{task.seq}
        </td>

        {/* Title */}
        <td style={{ padding: '10px 12px', verticalAlign: 'middle', minWidth: 180 }}>
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--ink)',
              lineHeight: 1.35,
            }}
          >
            {task.title}
          </span>
        </td>

        {/* Status */}
        <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusPill status={status} />
            {delayed && <span style={DELAYED_BADGE}>delayed</span>}
          </div>
        </td>

        {/* Assignee */}
        <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
          {assigneeName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Avatar name={assigneeName} size={18} />
              <span style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink)' }}>
                {assigneeName}
              </span>
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>—</span>
          )}
        </td>

        {/* Planned start */}
        <td
          style={{
            padding: '10px 12px',
            verticalAlign: 'middle',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {task.planned_start_at ? fmtDate(task.planned_start_at) : '—'}
        </td>

        {/* Estimated finish */}
        <td
          style={{
            padding: '10px 12px',
            verticalAlign: 'middle',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: delayed ? 'var(--bad)' : 'var(--muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {task.estimated_finish_at ? fmtDate(task.estimated_finish_at) : '—'}
        </td>

        {/* Actions */}
        <td
          style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className="icon-btn"
              title="Actions"
              onClick={() => setMenuOpen(o => !o)}
              style={{ fontSize: 13, letterSpacing: 1 }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  zIndex: 300,
                  background: 'var(--surface)',
                  border: '1px solid var(--line-2)',
                  borderRadius: 8,
                  boxShadow: '0 8px 28px rgba(20,18,14,0.16)',
                  minWidth: 148,
                  padding: '4px 0',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {([
                  ['Open', () => { setMenuOpen(false); onOpen(task.id); }],
                  ...(status === 'todo' || status === 'backlog'
                    ? [['Take', () => { setMenuOpen(false); setDialog('take'); }] as const]
                    : []),
                  ...(status === 'in_progress'
                    ? [
                        ['Mark done', () => { setMenuOpen(false); markDone.mutate(); }] as const,
                        ['Reassign', () => { setMenuOpen(false); setDialog('reassign'); }] as const,
                        ['Delay', () => { setMenuOpen(false); setDialog('delay'); }] as const,
                      ]
                    : []),
                  ...(status === 'done' || status === 'cancelled'
                    ? [['Reopen', () => { setMenuOpen(false); setDialog('reopen'); }] as const]
                    : []),
                ] as [string, () => void][]).map(([label, action]) => (
                  <button
                    key={label}
                    style={{
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      padding: '7px 14px',
                      fontSize: 12.5,
                      color: 'var(--ink)',
                      cursor: 'pointer',
                      fontFamily: 'var(--sans)',
                      width: '100%',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    onClick={action}
                  >
                    {label}
                  </button>
                ))}
                {status !== 'done' && status !== 'cancelled' && (
                  <>
                    <div style={{ height: 1, background: 'var(--line)', margin: '3px 0' }} />
                    <button
                      style={{
                        background: 'none',
                        border: 'none',
                        textAlign: 'left',
                        padding: '7px 14px',
                        fontSize: 12.5,
                        color: 'var(--bad)',
                        cursor: 'pointer',
                        fontFamily: 'var(--sans)',
                        width: '100%',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      onClick={() => { setMenuOpen(false); setDialog('cancel'); }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </td>
      </tr>

      {/* Action dialogs */}
      {dialog === 'take' && (
        <TakeTaskDialog task={task} projectId={projectId} onClose={() => setDialog(null)} />
      )}
      {dialog === 'reassign' && (
        <ReassignDialog
          task={task}
          projectId={projectId}
          members={members}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'cancel' && (
        <CancelDialog task={task} projectId={projectId} onClose={() => setDialog(null)} />
      )}
      {dialog === 'reopen' && (
        <ReopenDialog task={task} projectId={projectId} onClose={() => setDialog(null)} />
      )}
      {dialog === 'delay' && (
        <DelayDialog task={task} projectId={projectId} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

interface TaskListProps {
  tasks: Task[];
  projectId: string;
  members: MemberView[];
  onOpen: (id: string) => void;
}

const HEADERS: { key: SortKey; label: string }[] = [
  { key: 'seq', label: '#' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'planned_start_at', label: 'Planned start' },
  { key: 'estimated_finish_at', label: 'Est. finish' },
];

export function TaskList({ tasks, projectId, members, onOpen }: TaskListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('seq');
  const [sortAsc, setSortAsc] = useState(true);

  if (tasks.length === 0) {
    return <EmptyState message="No tasks match the current filters." />;
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...tasks].sort((a, b) => {
    let va: string | number = 0;
    let vb: string | number = 0;
    switch (sortKey) {
      case 'seq': va = a.seq; vb = b.seq; break;
      case 'title': va = a.title.toLowerCase(); vb = b.title.toLowerCase(); break;
      case 'status': va = a.status; vb = b.status; break;
      case 'assignee': va = a.assignee_user_id ?? ''; vb = b.assignee_user_id ?? ''; break;
      case 'planned_start_at': va = a.planned_start_at ?? ''; vb = b.planned_start_at ?? ''; break;
      case 'estimated_finish_at': va = a.estimated_finish_at ?? ''; vb = b.estimated_finish_at ?? ''; break;
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--muted-2)',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          background: 'var(--surface)',
        }}
      >
        <thead>
          <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
            {HEADERS.map(h => (
              <th
                key={h.key}
                style={thStyle}
                onClick={() => handleSort(h.key)}
              >
                {h.label}
                {sortKey === h.key && (
                  <span style={{ marginLeft: 4 }}>{sortAsc ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
            <th style={{ ...thStyle, cursor: 'default' }}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              projectId={projectId}
              members={members}
              onOpen={onOpen}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
