/**
 * C2 — Iteration Detail Page
 * Route: /iterations/:iterationId
 * Shows iteration fields, status controls, and linked samples with
 * input/output/passthrough role picker.
 */
import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import {
  useIteration,
  useUpdateIteration,
  useIterationSamples,
  useLinkIterationSample,
  useUnlinkIterationSample,
  useProjectSamples,
} from '@/hooks/useQueries';
import type { Sample } from '@/api/types';
import type { IterationSample } from '@/hooks/useQueries';
import { RiskRegister } from '@/components/RiskRegister';

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

// ─── Sample Link Picker ───────────────────────────────────────────────────────

interface SampleLinkPickerProps {
  iterationId: string;
  projectId: string;
  alreadyLinked: IterationSample[];
  onClose: () => void;
}

function SampleLinkPicker({ iterationId, projectId, alreadyLinked, onClose }: SampleLinkPickerProps) {
  const { data: projectSamples = [] } = useProjectSamples(projectId);
  const [selectedId, setSelectedId] = useState('');
  const [role, setRole] = useState('input');
  const [note, setNote] = useState('');
  const link = useLinkIterationSample(iterationId);

  const linkedIds = new Set(alreadyLinked.map(s => s.sample_id));
  const available = projectSamples.filter((s: Sample) => !linkedIds.has(s.id));

  const handleLink = async () => {
    if (!selectedId) return;
    await link.mutateAsync({ sample_id: selectedId, role, note: note || undefined });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Link Sample</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <FieldGroup label="Sample">
            {available.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                All project samples are already linked.
              </div>
            ) : (
              <select className="field-input" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                <option value="">— select sample —</option>
                {available.map((s: Sample) => (
                  <option key={s.id} value={s.id}>{s.identifier} · {s.name || s.kind}</option>
                ))}
              </select>
            )}
          </FieldGroup>
          <FieldGroup label="Role">
            <div style={{ display: 'flex', gap: 8 }}>
              {['input', 'output', 'passthrough'].map(r => (
                <button key={r} onClick={() => setRole(r)} className={`status-opt${role === r ? ' sel' : ''}`}>
                  {r}
                </button>
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label="Note (optional)">
            <input className="field-input" value={note} onChange={e => setNote(e.target.value)} placeholder="optional note" />
          </FieldGroup>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button className="top-btn primary" onClick={handleLink} disabled={!selectedId || link.isPending}>
            {link.isPending ? 'Linking…' : 'Link sample'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Linked samples list ──────────────────────────────────────────────────────

function LinkedSampleRow({ item, iterationId }: { item: IterationSample; iterationId: string }) {
  const unlink = useUnlinkIterationSample(iterationId);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)', flex: '0 0 auto' }}>
        {item.sample_id.slice(0, 8)}
      </span>
      {item.role && (
        <span className="pill">{item.role}</span>
      )}
      {item.note && (
        <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1 }}>{item.note}</span>
      )}
      <button
        className="icon-btn"
        style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--bad)' }}
        onClick={() => unlink.mutate(item.sample_id)}
        title="Unlink sample"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function IterationDetailPage() {
  const { iterationId } = useParams({ strict: false }) as { iterationId: string };
  const { data: iteration, isLoading, isError } = useIteration(iterationId);
  const { data: linkedSamples = [] } = useIterationSamples(iterationId);

  const [editOpen, setEditOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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
      {pickerOpen && (
        <SampleLinkPicker
          iterationId={iterationId}
          projectId={iteration.project_id}
          alreadyLinked={linkedSamples}
          onClose={() => setPickerOpen(false)}
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

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginBottom: 32 }}>
          {[
            { label: 'Start', value: iteration.start_at ? new Date(iteration.start_at).toLocaleDateString() : '—' },
            { label: 'End', value: iteration.end_at ? new Date(iteration.end_at).toLocaleDateString() : '—' },
            { label: 'Samples Linked', value: linkedSamples.length },
          ].map(m => (
            <div key={m.label} style={{ background: 'var(--surface)', padding: '14px 18px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                {m.label}
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink)', lineHeight: 1 }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Risk Register */}
        <RiskRegister projectId={iteration.project_id} iterationId={iterationId} />

        {/* Linked Samples */}
        <div className="section-h">
          <h2>Linked Samples</h2>
          <span className="meta">{linkedSamples.length} linked</span>
          <div className="right">
            <button className="top-btn primary" onClick={() => setPickerOpen(true)}>
              + Link sample
            </button>
          </div>
        </div>

        {linkedSamples.length === 0 ? (
          <EmptyState message="No samples linked to this iteration." />
        ) : (
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>
            {linkedSamples.map(item => (
              <LinkedSampleRow key={item.id} item={item} iterationId={iterationId} />
            ))}
          </div>
        )}

        {/* Timestamps */}
        <div style={{ marginTop: 40, display: 'flex', gap: 24, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
          <span>Created {new Date(iteration.created_at).toLocaleDateString()}</span>
          <span>Updated {new Date(iteration.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    </AppShell>
  );
}
