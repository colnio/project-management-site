/**
 * TaskDetailDrawer — fixed right-side panel for a task.
 * Shows metadata, action buttons, references picker, and activity timeline.
 */
import { useState } from 'react';
import { StatusPill } from '@/components/StatusPill';
import { Avatar } from '@/components/Avatar';
import { useTask, isDelayed, useMarkDone } from '@/hooks/useTaskQueries';
import type { MemberView } from '@/hooks/useWorkspaceQueries';
import { resolveUserLabel, buildUserDirectory } from '@/lib/userDisplay';
import { fmtDate } from '@/lib/formatDate';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { TaskReferencePicker } from './TaskReferencePicker';
import { TaskProgressTimeline } from './TaskProgressTimeline';
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
  padding: '2px 8px',
  fontFamily: 'var(--mono)',
};

type Dialog = 'take' | 'reassign' | 'cancel' | 'reopen' | 'delay' | null;

interface TaskDetailDrawerProps {
  taskId: string;
  projectId: string;
  members: MemberView[];
  onClose: () => void;
}

export function TaskDetailDrawer({
  taskId,
  projectId,
  members,
  onClose,
}: TaskDetailDrawerProps) {
  const { data: task, isLoading, isError } = useTask(taskId);
  const markDone = useMarkDone(taskId, projectId);
  const [dialog, setDialog] = useState<Dialog>(null);

  const dir = buildUserDirectory(members);

  return (
    <>
      {/* Translucent backdrop behind drawer */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.18)',
          zIndex: 290,
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(560px, 100vw)',
          background: 'var(--surface)',
          boxShadow: '-4px 0 32px rgba(20,18,14,0.18)',
          zIndex: 300,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Inner padding container */}
        <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Close button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="icon-btn"
              onClick={onClose}
              style={{ fontSize: 14 }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {isLoading && <LoadingState message="Loading task…" />}
          {isError && <ErrorState message="Failed to load task." />}

          {task && (
            <>
              {/* Header */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10.5,
                    color: 'var(--muted-2)',
                  }}
                >
                  #{task.seq}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 20,
                    fontWeight: 400,
                    color: 'var(--ink)',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.3,
                  }}
                >
                  {task.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusPill status={task.status} />
                  {isDelayed(task) && <span style={DELAYED_BADGE}>delayed</span>}
                </div>
                {task.description && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      color: 'var(--muted)',
                      lineHeight: 1.6,
                    }}
                  >
                    {task.description}
                  </p>
                )}
              </div>

              {/* Metadata grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  background: 'var(--paper-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '14px 16px',
                }}
              >
                <MetaField label="Assignee">
                  {task.assignee_user_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar name={resolveUserLabel(dir, task.assignee_user_id)} size={18} />
                      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                        {resolveUserLabel(dir, task.assignee_user_id)}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--muted-2)' }}>—</span>
                  )}
                </MetaField>

                <MetaField label="Planned start">
                  <span style={{ color: task.planned_start_at ? 'var(--ink)' : 'var(--muted-2)' }}>
                    {task.planned_start_at ? fmtDate(task.planned_start_at) : '—'}
                  </span>
                </MetaField>

                <MetaField label="Est. finish">
                  <span style={{ color: isDelayed(task) ? 'var(--bad)' : task.estimated_finish_at ? 'var(--ink)' : 'var(--muted-2)' }}>
                    {task.estimated_finish_at ? fmtDate(task.estimated_finish_at) : '—'}
                  </span>
                </MetaField>

                <MetaField label="Started">
                  <span style={{ color: task.started_at ? 'var(--ink)' : 'var(--muted-2)' }}>
                    {task.started_at ? fmtDate(task.started_at) : '—'}
                  </span>
                </MetaField>

                <MetaField label="Finished">
                  <span style={{ color: task.finished_at ? 'var(--ink)' : 'var(--muted-2)' }}>
                    {task.finished_at ? fmtDate(task.finished_at) : '—'}
                  </span>
                </MetaField>

                <MetaField label="Created by">
                  <span style={{ color: 'var(--ink)', fontSize: 12.5 }}>
                    {resolveUserLabel(dir, task.created_by)}
                  </span>
                </MetaField>
              </div>

              {/* Action buttons row */}
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {(task.status === 'todo' || task.status === 'backlog') && (
                  <button
                    className="top-btn"
                    style={{ fontSize: 12 }}
                    onClick={() => setDialog('take')}
                  >
                    Take
                  </button>
                )}
                {task.status === 'in_progress' && (
                  <>
                    <button
                      className="top-btn primary"
                      style={{ fontSize: 12 }}
                      onClick={() => markDone.mutate()}
                      disabled={markDone.isPending}
                    >
                      {markDone.isPending ? 'Marking…' : 'Mark done'}
                    </button>
                    <button
                      className="top-btn"
                      style={{ fontSize: 12 }}
                      onClick={() => setDialog('reassign')}
                    >
                      Reassign
                    </button>
                    <button
                      className="top-btn"
                      style={{ fontSize: 12 }}
                      onClick={() => setDialog('delay')}
                    >
                      Delay
                    </button>
                  </>
                )}
                {(task.status === 'done' || task.status === 'cancelled') && (
                  <button
                    className="top-btn"
                    style={{ fontSize: 12 }}
                    onClick={() => setDialog('reopen')}
                  >
                    Reopen
                  </button>
                )}
                {task.status !== 'done' && task.status !== 'cancelled' && (
                  <button
                    className="top-btn"
                    style={{ fontSize: 12, color: 'var(--bad)' }}
                    onClick={() => setDialog('cancel')}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Mark done error surface */}
              {markDone.isError && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bad)' }}>
                  {(markDone.error as Error).message}
                </div>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--line)' }} />

              {/* References section */}
              <DrawerSection title="References">
                <TaskReferencePicker taskId={taskId} projectId={projectId} />
              </DrawerSection>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--line)' }} />

              {/* Activity section */}
              <DrawerSection title="Activity">
                <TaskProgressTimeline taskId={taskId} members={members} />
              </DrawerSection>
            </>
          )}
        </div>
      </div>

      {/* Action dialogs */}
      {task && dialog === 'take' && (
        <TakeTaskDialog task={task} projectId={projectId} onClose={() => setDialog(null)} />
      )}
      {task && dialog === 'reassign' && (
        <ReassignDialog
          task={task}
          projectId={projectId}
          members={members}
          onClose={() => setDialog(null)}
        />
      )}
      {task && dialog === 'cancel' && (
        <CancelDialog task={task} projectId={projectId} onClose={() => setDialog(null)} />
      )}
      {task && dialog === 'reopen' && (
        <ReopenDialog task={task} projectId={projectId} onClose={() => setDialog(null)} />
      )}
      {task && dialog === 'delay' && (
        <DelayDialog task={task} projectId={projectId} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'var(--muted-2)',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function MetaField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          color: 'var(--muted-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)' }}>
        {children}
      </div>
    </div>
  );
}
