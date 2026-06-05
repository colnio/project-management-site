/**
 * NewTaskDialog — create a new task.
 * Uses Backdrop + DialogCard pattern from RiskFormDialog.tsx.
 */
import { useState } from 'react';
import { useCreateTask } from '@/hooks/useTaskQueries';
import { useProjectIterations, useWorkspaceMembers } from '@/hooks/useQueries';
import { memberLabel } from '@/lib/userDisplay';

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.30)',
          zIndex: 200,
          backdropFilter: 'blur(3px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: '100%',
          maxWidth: 520,
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

const dateInputStyle: React.CSSProperties = {
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

interface NewTaskDialogProps {
  projectId: string;
  iterationId?: string;
  workspaceId?: string;
  onClose: () => void;
}

export function NewTaskDialog({ projectId, iterationId, workspaceId, onClose }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIterationId, setSelectedIterationId] = useState(iterationId ?? '');
  const [assigneeId, setAssigneeId] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');

  const { data: iterations = [] } = useProjectIterations(projectId);
  const { data: members = [] } = useWorkspaceMembers(workspaceId);
  const createTask = useCreateTask(projectId);
  const errMsg = createTask.isError ? (createTask.error as Error).message : null;

  const toRFC3339 = (dateStr: string) =>
    dateStr ? new Date(dateStr).toISOString() : undefined;

  const handleSubmit = () => {
    if (!title.trim()) return;
    const body: Parameters<typeof createTask.mutate>[0] = {
      title: title.trim(),
      description: description.trim() || undefined,
      iteration_id: selectedIterationId || undefined,
      assignee_user_id: assigneeId || undefined,
      planned_start_at: toRFC3339(plannedStart),
      estimated_finish_at: toRFC3339(plannedEnd),
    };
    createTask.mutate(body, { onSuccess: onClose });
  };

  return (
    <Backdrop onClose={onClose}>
      <DialogCard>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            New task
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            style={{ fontSize: 14 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Title */}
        <div>
          <FieldLabel>Title *</FieldLabel>
          <input
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            autoFocus
            disabled={createTask.isPending}
            onKeyDown={e => { if (e.key === 'Enter' && title.trim()) handleSubmit(); }}
          />
        </div>

        {/* Description */}
        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical' }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional details"
            disabled={createTask.isPending}
          />
        </div>

        {/* Iteration */}
        <div>
          <FieldLabel>Iteration</FieldLabel>
          <select
            style={selectStyle}
            value={selectedIterationId}
            onChange={e => setSelectedIterationId(e.target.value)}
            disabled={createTask.isPending}
          >
            <option value="">— none —</option>
            {iterations.map(it => (
              <option key={it.id} value={it.id}>
                {it.title}
              </option>
            ))}
          </select>
        </div>

        {/* Executor (planned assignee) */}
        <div>
          <FieldLabel>Executor (planned)</FieldLabel>
          <select
            style={selectStyle}
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            disabled={createTask.isPending}
          >
            <option value="">— none —</option>
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
        </div>

        {/* Planned start */}
        <div>
          <FieldLabel>Planned start</FieldLabel>
          <input
            type="date"
            style={dateInputStyle}
            value={plannedStart}
            onChange={e => setPlannedStart(e.target.value)}
            disabled={createTask.isPending}
          />
        </div>

        {/* Planned end */}
        <div>
          <FieldLabel>Planned end</FieldLabel>
          <input
            type="date"
            style={dateInputStyle}
            value={plannedEnd}
            onChange={e => setPlannedEnd(e.target.value)}
            disabled={createTask.isPending}
          />
        </div>

        {/* Inline error */}
        {errMsg && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bad)' }}>
            {errMsg}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button className="top-btn" onClick={onClose} disabled={createTask.isPending}>
            Cancel
          </button>
          <button
            className="top-btn primary"
            onClick={handleSubmit}
            disabled={!title.trim() || createTask.isPending}
          >
            {createTask.isPending ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </DialogCard>
    </Backdrop>
  );
}
