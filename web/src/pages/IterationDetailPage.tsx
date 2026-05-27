/**
 * C2 — Iteration Detail Page
 * Route: /iterations/:iterationId
 * Shows iteration header + BlockNote editor (entityDashboard block inside).
 * Linking/unlinking samples and artifacts is available via IterationDashboard
 * (read-only view) inside the entityDashboard block. The Edit dialog remains
 * for quick field edits without opening the full editor.
 */
import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import {
  useIteration,
  useUpdateIteration,
} from '@/hooks/useQueries';
import { EntityPageEditor } from '@/components/editor/EntityPageEditor';

// ─── Local field editor ───────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const STATUS_OPTIONS = ['planned', 'active', 'done', 'blocked'] as const;
type IterStatus = (typeof STATUS_OPTIONS)[number];

// ─── Iteration edit dialog ────────────────────────────────────────────────────

interface EditDialogProps {
  iterationId: string;
  projectId: string;
  initial: {
    title: string;
    description: string;
    status: string;
    start_at?: string;
    end_at?: string;
  };
  onClose: () => void;
}

function EditDialog({ iterationId, projectId, initial, onClose }: EditDialogProps) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status as IterStatus);
  const [startAt, setStartAt] = useState(initial.start_at?.slice(0, 10) ?? '');
  const [endAt, setEndAt] = useState(initial.end_at?.slice(0, 10) ?? '');

  const update = useUpdateIteration(iterationId, projectId);

  const handleSave = async () => {
    await update.mutateAsync({
      title,
      description,
      status,
      start_at: startAt ? new Date(startAt).toISOString() : undefined,
      end_at: endAt ? new Date(endAt).toISOString() : undefined,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Edit Iteration</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <FieldGroup label="Title">
            <input className="field-input" value={title} onChange={e => setTitle(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Description">
            <textarea className="field-textarea" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </FieldGroup>
          <FieldGroup label="Status">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`status-opt${status === s ? ' sel' : ''}`}>
                  <StatusPill status={s} />
                </button>
              ))}
            </div>
          </FieldGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FieldGroup label="Start Date">
              <input type="date" className="field-input" value={startAt} onChange={e => setStartAt(e.target.value)} />
            </FieldGroup>
            <FieldGroup label="End Date">
              <input type="date" className="field-input" value={endAt} onChange={e => setEndAt(e.target.value)} />
            </FieldGroup>
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button className="top-btn primary" onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function IterationDetailPage() {
  const { iterationId } = useParams({ strict: false }) as { iterationId: string };
  const { data: iteration, isLoading, isError } = useIteration(iterationId);

  const [editOpen, setEditOpen] = useState(false);

  const crumbs = [
    { label: 'Project', href: iteration ? `/projects/${iteration.project_id}?tab=iterations` : '/workspaces' },
    { label: iteration?.title ?? 'Iteration' },
  ];

  if (isLoading) return <AppShell topBarCrumbs={crumbs}><LoadingState /></AppShell>;
  if (isError || !iteration) return <AppShell topBarCrumbs={crumbs}><ErrorState message="Failed to load iteration." /></AppShell>;

  return (
    <AppShell activeProjectId={iteration.project_id} topBarCrumbs={crumbs}>
      {editOpen && (
        <EditDialog
          iterationId={iterationId}
          projectId={iteration.project_id}
          initial={{
            title: iteration.title,
            description: iteration.description,
            status: iteration.status,
            start_at: iteration.start_at,
            end_at: iteration.end_at,
          }}
          onClose={() => setEditOpen(false)}
        />
      )}

      <div className="page-wrap" style={{ paddingTop: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', background: 'var(--paper-2)', padding: '2px 7px', borderRadius: 99, border: '1px solid var(--line)' }}>
                #{iteration.position}
              </span>
              <StatusPill status={iteration.status} />
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 8px', lineHeight: 1.25 }}>
              {iteration.title}
            </h1>
            {iteration.description && (
              <p style={{ margin: 0, fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 640 }}>
                {iteration.description}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link to="/projects/$projectId" params={{ projectId: iteration.project_id }} search={{ tab: 'iterations' }} className="top-btn">
              ← Back
            </Link>
            <button className="top-btn primary" onClick={() => setEditOpen(true)}>
              Edit
            </button>
          </div>
        </div>

        {/* Entity page editor (contains entityDashboard block with meta/risks/samples + notes) */}
        <EntityPageEditor
          parentType="iteration"
          parentId={iterationId}
          projectId={iteration.project_id}
        />
      </div>
    </AppShell>
  );
}
