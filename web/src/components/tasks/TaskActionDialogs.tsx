/**
 * Action dialogs for task workflow transitions.
 * All dialogs use the Backdrop + DialogCard pattern from RiskFormDialog.tsx.
 *
 * Exported: TakeTaskDialog, ReassignDialog, CancelDialog, ReopenDialog, DelayDialog
 */
import { useState } from 'react';
import type { MemberView } from '@/hooks/useWorkspaceQueries';
import { memberLabel } from '@/lib/userDisplay';
import {
  useTakeTask,
  useReassignTask,
  useCancelTask,
  useReopenTask,
  useDelayTask,
  type Task,
} from '@/hooks/useTaskQueries';

// ─── Modal primitives (mirrors RiskFormDialog) ────────────────────────────────

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.30)',
          zIndex: 410,
          backdropFilter: 'blur(3px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 411,
          width: '100%',
          maxWidth: 480,
          padding: '0 16px',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </>
  );
}

function DialogCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-2)',
        borderRadius: 12,
        padding: '24px 28px 22px',
        boxShadow: '0 24px 72px rgba(20,18,14,0.22)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

function DialogTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--serif)',
        fontSize: 18,
        fontWeight: 400,
        color: 'var(--ink)',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        color: 'var(--muted-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 13,
  background: 'var(--paper-2)',
  border: '1px solid var(--line)',
  borderRadius: 5,
  color: 'var(--ink)',
  padding: '7px 10px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  background: 'var(--paper-2)',
  border: '1px solid var(--line)',
  borderRadius: 5,
  color: 'var(--ink)',
  padding: '6px 10px',
  cursor: 'pointer',
  width: '100%',
};

function InlineError({ message }: { message: string }) {
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bad)' }}>
      {message}
    </div>
  );
}

function DialogFooter({
  onClose,
  onSubmit,
  isPending,
  submitLabel,
  disabled,
}: {
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
      <button className="top-btn" onClick={onClose} disabled={isPending}>
        Cancel
      </button>
      <button
        className="top-btn primary"
        onClick={onSubmit}
        disabled={disabled || isPending}
      >
        {isPending ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

// ─── TakeTaskDialog ───────────────────────────────────────────────────────────

interface TakeTaskDialogProps {
  task: Task;
  projectId: string;
  onClose: () => void;
}

export function TakeTaskDialog({ task, projectId, onClose }: TakeTaskDialogProps) {
  const [estimate, setEstimate] = useState('');
  const takeTask = useTakeTask(task.id, projectId);
  const errMsg = takeTask.isError ? (takeTask.error as Error).message : null;

  const handleSubmit = () => {
    if (!estimate) return;
    takeTask.mutate(
      { estimated_finish_at: new Date(estimate).toISOString() },
      { onSuccess: onClose },
    );
  };

  return (
    <Backdrop onClose={onClose}>
      <DialogCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle>Take task</DialogTitle>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }} aria-label="Close">✕</button>
        </div>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--muted)' }}>
          #{task.seq} — {task.title}
        </div>
        <div>
          <FieldLabel>Estimated finish *</FieldLabel>
          <input
            type="datetime-local"
            style={inputStyle}
            value={estimate}
            onChange={e => setEstimate(e.target.value)}
            disabled={takeTask.isPending}
          />
        </div>
        {errMsg && <InlineError message={errMsg} />}
        <DialogFooter
          onClose={onClose}
          onSubmit={handleSubmit}
          isPending={takeTask.isPending}
          submitLabel="Take task"
          disabled={!estimate}
        />
      </DialogCard>
    </Backdrop>
  );
}

// ─── ReassignDialog ───────────────────────────────────────────────────────────

interface ReassignDialogProps {
  task: Task;
  projectId: string;
  members: MemberView[];
  onClose: () => void;
}

export function ReassignDialog({ task, projectId, members, onClose }: ReassignDialogProps) {
  const [assigneeId, setAssigneeId] = useState(task.assignee_user_id ?? '');
  const [comment, setComment] = useState('');
  const reassign = useReassignTask(task.id, projectId);
  const errMsg = reassign.isError ? (reassign.error as Error).message : null;

  const handleSubmit = () => {
    if (!assigneeId || !comment.trim()) return;
    reassign.mutate(
      { assignee_user_id: assigneeId, comment: comment.trim() },
      { onSuccess: onClose },
    );
  };

  return (
    <Backdrop onClose={onClose}>
      <DialogCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle>Reassign task</DialogTitle>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }} aria-label="Close">✕</button>
        </div>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--muted)' }}>
          #{task.seq} — {task.title}
        </div>
        <div>
          <FieldLabel>Assign to *</FieldLabel>
          <select
            style={selectStyle}
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            disabled={reassign.isPending}
          >
            <option value="">— select member —</option>
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Comment *</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical' }}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Reason for reassignment"
            disabled={reassign.isPending}
          />
        </div>
        {errMsg && <InlineError message={errMsg} />}
        <DialogFooter
          onClose={onClose}
          onSubmit={handleSubmit}
          isPending={reassign.isPending}
          submitLabel="Reassign"
          disabled={!assigneeId || !comment.trim()}
        />
      </DialogCard>
    </Backdrop>
  );
}

// ─── CancelDialog ─────────────────────────────────────────────────────────────

interface CancelDialogProps {
  task: Task;
  projectId: string;
  onClose: () => void;
}

export function CancelDialog({ task, projectId, onClose }: CancelDialogProps) {
  const [reason, setReason] = useState('');
  const cancelTask = useCancelTask(task.id, projectId);
  const errMsg = cancelTask.isError ? (cancelTask.error as Error).message : null;

  const handleSubmit = () => {
    if (!reason.trim()) return;
    cancelTask.mutate(
      { reason: reason.trim() },
      { onSuccess: onClose },
    );
  };

  return (
    <Backdrop onClose={onClose}>
      <DialogCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle>Cancel task</DialogTitle>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }} aria-label="Close">✕</button>
        </div>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--muted)' }}>
          #{task.seq} — {task.title}
        </div>
        <div>
          <FieldLabel>Reason *</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical' }}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is this task being cancelled?"
            autoFocus
            disabled={cancelTask.isPending}
          />
        </div>
        {errMsg && <InlineError message={errMsg} />}
        <DialogFooter
          onClose={onClose}
          onSubmit={handleSubmit}
          isPending={cancelTask.isPending}
          submitLabel="Cancel task"
          disabled={!reason.trim()}
        />
      </DialogCard>
    </Backdrop>
  );
}

// ─── ReopenDialog ─────────────────────────────────────────────────────────────

interface ReopenDialogProps {
  task: Task;
  projectId: string;
  onClose: () => void;
}

export function ReopenDialog({ task, projectId, onClose }: ReopenDialogProps) {
  const [targetStatus, setTargetStatus] = useState<'todo' | 'in_progress'>('todo');
  const [estimate, setEstimate] = useState('');
  const [comment, setComment] = useState('');
  const reopen = useReopenTask(task.id, projectId);
  const errMsg = reopen.isError ? (reopen.error as Error).message : null;

  const handleSubmit = () => {
    if (!comment.trim()) return;
    const body: Parameters<typeof reopen.mutate>[0] = {
      target_status: targetStatus,
      comment: comment.trim(),
    };
    if (targetStatus === 'in_progress' && estimate) {
      body.estimated_finish_at = new Date(estimate).toISOString();
    }
    reopen.mutate(body, { onSuccess: onClose });
  };

  return (
    <Backdrop onClose={onClose}>
      <DialogCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle>Reopen task</DialogTitle>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }} aria-label="Close">✕</button>
        </div>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--muted)' }}>
          #{task.seq} — {task.title}
        </div>
        <div>
          <FieldLabel>Reopen as</FieldLabel>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {(['todo', 'in_progress'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setTargetStatus(s)}
                className={`status-opt${targetStatus === s ? ' sel' : ''}`}
                disabled={reopen.isPending}
              >
                {s === 'todo' ? 'To do' : 'In progress'}
              </button>
            ))}
          </div>
        </div>
        {targetStatus === 'in_progress' && (
          <div>
            <FieldLabel>New estimated finish</FieldLabel>
            <input
              type="datetime-local"
              style={inputStyle}
              value={estimate}
              onChange={e => setEstimate(e.target.value)}
              disabled={reopen.isPending}
            />
          </div>
        )}
        <div>
          <FieldLabel>Comment *</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical' }}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Reason for reopening"
            disabled={reopen.isPending}
          />
        </div>
        {errMsg && <InlineError message={errMsg} />}
        <DialogFooter
          onClose={onClose}
          onSubmit={handleSubmit}
          isPending={reopen.isPending}
          submitLabel="Reopen"
          disabled={!comment.trim()}
        />
      </DialogCard>
    </Backdrop>
  );
}

// ─── DelayDialog ──────────────────────────────────────────────────────────────

interface DelayDialogProps {
  task: Task;
  projectId: string;
  onClose: () => void;
}

export function DelayDialog({ task, projectId, onClose }: DelayDialogProps) {
  const [newEstimate, setNewEstimate] = useState('');
  const [reason, setReason] = useState('');
  const [clientError, setClientError] = useState('');
  const delayTask = useDelayTask(task.id, projectId);
  const errMsg = delayTask.isError ? (delayTask.error as Error).message : null;

  const handleSubmit = () => {
    if (!newEstimate || !reason.trim()) return;
    // Client-side guard: new estimate must be later than current
    if (task.estimated_finish_at) {
      const current = new Date(task.estimated_finish_at).getTime();
      const next = new Date(newEstimate).getTime();
      if (next <= current) {
        setClientError('New estimate must be later than the current estimate.');
        return;
      }
    }
    setClientError('');
    delayTask.mutate(
      { new_estimated_finish_at: new Date(newEstimate).toISOString(), reason: reason.trim() },
      { onSuccess: onClose },
    );
  };

  return (
    <Backdrop onClose={onClose}>
      <DialogCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle>Delay task</DialogTitle>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }} aria-label="Close">✕</button>
        </div>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--muted)' }}>
          #{task.seq} — {task.title}
        </div>
        {task.estimated_finish_at && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
            Current estimate: {new Date(task.estimated_finish_at).toLocaleString()}
          </div>
        )}
        <div>
          <FieldLabel>New estimated finish *</FieldLabel>
          <input
            type="datetime-local"
            style={inputStyle}
            value={newEstimate}
            onChange={e => { setNewEstimate(e.target.value); setClientError(''); }}
            disabled={delayTask.isPending}
          />
        </div>
        <div>
          <FieldLabel>Reason *</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical' }}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is this task being delayed?"
            disabled={delayTask.isPending}
          />
        </div>
        {clientError && <InlineError message={clientError} />}
        {errMsg && <InlineError message={errMsg} />}
        <DialogFooter
          onClose={onClose}
          onSubmit={handleSubmit}
          isPending={delayTask.isPending}
          submitLabel="Confirm delay"
          disabled={!newEstimate || !reason.trim()}
        />
      </DialogCard>
    </Backdrop>
  );
}
