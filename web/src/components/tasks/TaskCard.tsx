/**
 * TaskCard — compact board card for a task.
 * Shows: #seq, title, StatusPill, delayed badge, assignee avatar, estimated finish.
 * Kebab menu with status-appropriate actions.
 */
import { useState, useRef, useEffect } from 'react';
import { StatusPill } from '@/components/StatusPill';
import { Avatar } from '@/components/Avatar';
import { isDelayed, useMarkDone, type Task } from '@/hooks/useTaskQueries';
import type { MemberView } from '@/hooks/useWorkspaceQueries';
import { memberLabel } from '@/lib/userDisplay';
import { fmtDate } from '@/lib/formatDate';
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
  letterSpacing: '0.03em',
};

type Dialog = 'take' | 'reassign' | 'cancel' | 'reopen' | 'delay' | null;

interface TaskCardProps {
  task: Task;
  projectId: string;
  members: MemberView[];
  onOpen: (id: string) => void;
}

export function TaskCard({ task, projectId, members, onOpen }: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);

  const markDone = useMarkDone(task.id, projectId);
  const delayed = isDelayed(task);

  const assignee = task.assignee_user_id
    ? members.find(m => m.user_id === task.assignee_user_id)
    : null;
  const assigneeName = assignee ? memberLabel(assignee) : null;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        kebabRef.current && !kebabRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const menuItemStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    textAlign: 'left',
    padding: '7px 14px',
    fontSize: 12.5,
    color: 'var(--ink)',
    cursor: 'pointer',
    fontFamily: 'var(--sans)',
    width: '100%',
  };

  const { status } = task;

  return (
    <>
      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '10px 12px',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          cursor: 'pointer',
        }}
        onClick={() => onOpen(task.id)}
      >
        {/* Top row: seq + kebab */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--muted-2)',
            }}
          >
            #{task.seq}
          </span>
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              ref={kebabRef}
              className="icon-btn"
              title="Actions"
              onClick={() => setMenuOpen(o => !o)}
              style={{ fontSize: 13, letterSpacing: 1, padding: '2px 4px' }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                ref={menuRef}
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
                <button
                  style={menuItemStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  onClick={() => { setMenuOpen(false); onOpen(task.id); }}
                >
                  Open
                </button>
                {(status === 'todo' || status === 'backlog') && (
                  <button
                    style={menuItemStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    onClick={() => { setMenuOpen(false); setDialog('take'); }}
                  >
                    Take
                  </button>
                )}
                {status === 'in_progress' && (
                  <>
                    <button
                      style={menuItemStyle}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      onClick={() => { setMenuOpen(false); markDone.mutate(); }}
                      disabled={markDone.isPending}
                    >
                      {markDone.isPending ? 'Marking…' : 'Mark done'}
                    </button>
                    <button
                      style={menuItemStyle}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      onClick={() => { setMenuOpen(false); setDialog('reassign'); }}
                    >
                      Reassign
                    </button>
                    <button
                      style={menuItemStyle}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      onClick={() => { setMenuOpen(false); setDialog('delay'); }}
                    >
                      Delay
                    </button>
                  </>
                )}
                {(status === 'done' || status === 'cancelled') && (
                  <button
                    style={menuItemStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    onClick={() => { setMenuOpen(false); setDialog('reopen'); }}
                  >
                    Reopen
                  </button>
                )}
                {status !== 'done' && status !== 'cancelled' && (
                  <>
                    <div style={{ height: 1, background: 'var(--line)', margin: '3px 0' }} />
                    <button
                      style={{ ...menuItemStyle, color: 'var(--bad)' }}
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
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 1.35,
          }}
        >
          {task.title}
        </div>

        {/* Status + delayed */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <StatusPill status={task.status} />
          {delayed && <span style={DELAYED_BADGE}>delayed</span>}
        </div>

        {/* Footer: assignee + estimate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {assigneeName && (
            <Avatar name={assigneeName} size={18} />
          )}
          {task.estimated_finish_at && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: delayed ? 'var(--bad)' : 'var(--muted-2)',
                marginLeft: 'auto',
              }}
            >
              {fmtDate(task.estimated_finish_at)}
            </span>
          )}
        </div>
      </div>

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
