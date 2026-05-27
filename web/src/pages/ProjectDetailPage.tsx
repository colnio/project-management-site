import { useState } from 'react';
import { useParams, useSearch, useRouter } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import { ArtifactUpload } from '@/components/ArtifactUpload';
import { ArtifactThumbnail, ArtifactDetailModal } from '@/components/ArtifactViewer';
import {
  useProject,
  useProjectSamples,
  useProjectExperiments,
  useProjectIterations,
  useProjectArtifacts,
  useCreateIteration,
  useCreateSample,
  useCreateExperiment,
} from '@/hooks/useQueries';
import { useDeleteArtifact } from '@/hooks/useArtifactQueries';
import { PagesPanel } from '@/components/PagesPanel';
import { ProjectTimeline } from '@/components/gantt/ProjectTimeline';
import { AIChatPanel } from '@/components/AIChatPanel';
import { WorkflowRunner } from '@/components/WorkflowRunner';
import { ProjectAutonomySection } from '@/components/AutonomyConfig';
import { RiskRegister } from '@/components/RiskRegister';
import type { Sample, Experiment, Iteration, Artifact } from '@/api/types';

type Tab = 'overview' | 'samples' | 'experiments' | 'iterations' | 'artifacts' | 'pages' | 'timeline' | 'ai' | 'workflows';

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  counts: Partial<Record<Tab, number>>;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'iterations', label: 'Iterations' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'samples', label: 'Samples' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'pages', label: 'Notes / Pages' },
  { id: 'workflows', label: 'AI Workflows' },
  { id: 'ai', label: 'AI Settings' },
];

function TabBar({ active, onChange, counts }: TabBarProps) {
  return (
    <div className="tabs">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`tab${active === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {counts[t.id] != null && (
            <span className="badge">{counts[t.id]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: samples = [] } = useProjectSamples(projectId);
  const { data: experiments = [] } = useProjectExperiments(projectId);
  const { data: iterations = [] } = useProjectIterations(projectId);
  const { data: artifacts = [] } = useProjectArtifacts(projectId);

  if (!project) return <LoadingState />;

  const stats = [
    { label: 'Samples', value: samples.length },
    { label: 'Iterations', value: iterations.length },
    { label: 'Experiments', value: experiments.length },
    { label: 'Artifacts', value: artifacts.length },
  ];

  return (
    <div className="page-wrap">
      {/* Project head */}
      <div className="proj-head">
        <div
          className="proj-emblem"
          style={{
            width: 48,
            height: 48,
            fontSize: 24,
          }}
        >
          {project.name[0]?.toUpperCase()}
        </div>
        <div className="proj-main">
          <div className="proj-title">{project.name}</div>
          <div className="proj-meta">
            <span>
              {project.visibility === 'private' ? '🔒 Private' : '🌐 Workspace'}
            </span>
            <span>
              Updated {new Date(project.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="proj-right">
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--muted)',
              padding: '3px 8px',
              border: '1px solid var(--line)',
              borderRadius: 99,
              background: 'var(--paper-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {project.visibility}
          </span>
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <div className="summary-prose">
          <p>{project.description}</p>
        </div>
      )}

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1,
          background: 'var(--line)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          overflow: 'hidden',
          margin: '24px 0',
        }}
      >
        {stats.map(s => (
          <div
            key={s.label}
            style={{
              background: 'var(--surface)',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontFamily: 'Libre Baskerville, serif',
                fontSize: 28,
                letterSpacing: '-0.01em',
                color: 'var(--ink)',
                lineHeight: 1,
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Risk Register */}
      <RiskRegister projectId={projectId} />

      {/* Recent samples preview */}
      {samples.length > 0 && (
        <>
          <div className="section-h">
            <h2>Recent Samples</h2>
            <span className="meta">{samples.length} total</span>
          </div>
          <div className="records">
            {samples.slice(0, 4).map(s => (
              <SampleCard key={s.id} sample={s} />
            ))}
          </div>
        </>
      )}

      {/* Recent experiments preview */}
      {experiments.length > 0 && (
        <>
          <div className="section-h">
            <h2>Recent Experiments</h2>
            <span className="meta">{experiments.length} total</span>
          </div>
          <div className="records">
            {experiments.slice(0, 4).map(e => (
              <ExperimentCard key={e.id} experiment={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Create Sample Dialog ─────────────────────────────────────────────────────

function CreateSampleDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('other');
  const createSample = useCreateSample(projectId);

  const handleCreate = async () => {
    if (!identifier.trim()) return;
    await createSample.mutateAsync({ identifier: identifier.trim(), name, kind });
    onClose();
  };

  const KINDS = ['precursor', 'electrode', 'cell', 'module', 'derivative', 'other'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">New Sample</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Identifier</div>
            <input className="field-input" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="e.g. NMC-001" autoFocus />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Name</div>
            <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Descriptive name" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Kind</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {KINDS.map(k => (
                <button key={k} onClick={() => setKind(k)} className={`status-opt${kind === k ? ' sel' : ''}`}>
                  <span className={`pill k-${k}`}>{k}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button className="top-btn primary" onClick={handleCreate} disabled={!identifier.trim() || createSample.isPending}>
            {createSample.isPending ? 'Creating…' : 'Create sample'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Samples Tab ─────────────────────────────────────────────────────────────

function SampleCard({ sample: s }: { sample: Sample }) {
  const router = useRouter();
  return (
    <div
      className="rec"
      style={{ cursor: 'pointer' }}
      onClick={() => void router.navigate({ to: '/samples/$sampleId', params: { sampleId: s.id } })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="id">{s.identifier}</span>
        <span style={{ marginLeft: 'auto' }}>
          <span className={`pill k-${s.kind}`}>{s.kind}</span>
        </span>
      </div>
      <div className="name">{s.name}</div>
      {s.description && (
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--muted)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {s.description}
        </div>
      )}
      <div className="foot">
        <StatusPill status={s.status} />
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted-2)',
          }}
        >
          {new Date(s.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function SamplesTab({ projectId }: { projectId: string }) {
  const { data: samples = [], isLoading, isError } = useProjectSamples(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterKind, setFilterKind] = useState('');

  if (isLoading) return <LoadingState message="Loading samples…" />;
  if (isError) return <ErrorState message="Failed to load samples." />;

  const KINDS = ['precursor', 'electrode', 'cell', 'module', 'derivative', 'other'];
  const filtered = filterKind ? samples.filter((s: Sample) => s.kind === filterKind) : samples;

  return (
    <div className="page-wrap wide">
      {createOpen && <CreateSampleDialog projectId={projectId} onClose={() => setCreateOpen(false)} />}
      <div className="section-h" style={{ marginBottom: 14 }}>
        <h2>Samples</h2>
        <span className="meta">{samples.length} total</span>
        <div className="right">
          <button className="top-btn primary" onClick={() => setCreateOpen(true)}>+ New sample</button>
        </div>
      </div>
      {/* Kind filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilterKind('')} className={`status-opt${filterKind === '' ? ' sel' : ''}`} style={{ fontSize: 12 }}>All</button>
        {KINDS.map(k => (
          <button key={k} onClick={() => setFilterKind(filterKind === k ? '' : k)} className={`status-opt${filterKind === k ? ' sel' : ''}`}>
            <span className={`pill k-${k}`}>{k}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <EmptyState message="No samples." /> : (
        <div className="records three">
          {filtered.map((s: Sample) => <SampleCard key={s.id} sample={s} />)}
        </div>
      )}
    </div>
  );
}

// ─── Create Experiment Dialog ─────────────────────────────────────────────────

function CreateExperimentDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [method, setMethod] = useState('cycling');
  const [status, setStatus] = useState('planned');
  const createExp = useCreateExperiment(projectId);
  const METHODS = ['cycling', 'synthesis', 'SEM', 'XRD', 'EIS', 'weighing', 'drying', 'custom'];

  const handleCreate = async () => {
    await createExp.mutateAsync({ method, status });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">New Experiment</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Method</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {METHODS.map(m => (
                <button key={m} onClick={() => setMethod(m)} className={`status-opt${method === m ? ' sel' : ''}`}>
                  <span className="pill">{m}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Initial status</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['planned', 'in_progress', 'completed', 'failed'].map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`status-opt${status === s ? ' sel' : ''}`}>
                  <StatusPill status={s} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button className="top-btn primary" onClick={handleCreate} disabled={createExp.isPending}>
            {createExp.isPending ? 'Creating…' : 'Create experiment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Experiments Tab ─────────────────────────────────────────────────────────

function ExperimentCard({ experiment: e }: { experiment: Experiment }) {
  const router = useRouter();
  return (
    <div
      className="rec"
      style={{ cursor: 'pointer' }}
      onClick={() => void router.navigate({ to: '/experiments/$experimentId', params: { experimentId: e.id } })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="id" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)' }}>
          {e.id.slice(0, 8)}…
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <span className="pill">{e.method}</span>
        </span>
      </div>
      <div className="name">{e.result_summary || e.method}</div>
      <div className="foot">
        <StatusPill status={e.status} />
        {e.performed_at && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted-2)',
            }}
          >
            {new Date(e.performed_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function ExperimentsTab({ projectId }: { projectId: string }) {
  const { data: experiments = [], isLoading, isError } = useProjectExperiments(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterMethod, setFilterMethod] = useState('');

  if (isLoading) return <LoadingState message="Loading experiments…" />;
  if (isError) return <ErrorState message="Failed to load experiments." />;

  const METHODS = ['cycling', 'synthesis', 'SEM', 'XRD', 'EIS', 'weighing', 'drying', 'custom'];
  const filtered = filterMethod ? experiments.filter((e: Experiment) => e.method === filterMethod) : experiments;

  return (
    <div className="page-wrap wide">
      {createOpen && <CreateExperimentDialog projectId={projectId} onClose={() => setCreateOpen(false)} />}
      <div className="section-h" style={{ marginBottom: 14 }}>
        <h2>Experiments</h2>
        <span className="meta">{experiments.length} total</span>
        <div className="right">
          <button className="top-btn primary" onClick={() => setCreateOpen(true)}>+ New experiment</button>
        </div>
      </div>
      {/* Method filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilterMethod('')} className={`status-opt${filterMethod === '' ? ' sel' : ''}`} style={{ fontSize: 12 }}>All</button>
        {METHODS.map(m => (
          <button key={m} onClick={() => setFilterMethod(filterMethod === m ? '' : m)} className={`status-opt${filterMethod === m ? ' sel' : ''}`}>
            <span className="pill">{m}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <EmptyState message="No experiments." /> : (
        <div className="records three">
          {filtered.map((e: Experiment) => <ExperimentCard key={e.id} experiment={e} />)}
        </div>
      )}
    </div>
  );
}

// ─── Create Iteration Dialog ──────────────────────────────────────────────────

function CreateIterationDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('planned');
  const createIter = useCreateIteration(projectId);

  const handleCreate = async () => {
    if (!title.trim()) return;
    await createIter.mutateAsync({ title: title.trim(), description, status });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">New Iteration</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Title</div>
            <input className="field-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Formation cycle batch" autoFocus />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Description</div>
            <textarea className="field-textarea" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What does this iteration cover?" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Initial status</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['planned', 'active', 'done', 'blocked'].map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`status-opt${status === s ? ' sel' : ''}`}>
                  <StatusPill status={s} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button className="top-btn primary" onClick={handleCreate} disabled={!title.trim() || createIter.isPending}>
            {createIter.isPending ? 'Creating…' : 'Create iteration'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Iterations Tab ──────────────────────────────────────────────────────────

function IterationRow({ iteration: it }: { iteration: Iteration }) {
  const router = useRouter();
  return (
    <div
      className="iter-row"
      style={{ cursor: 'pointer' }}
      onClick={() => void router.navigate({ to: '/iterations/$iterationId', params: { iterationId: it.id } })}
    >
      <div className="num" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
        {it.position}
      </div>
      <div className="title">
        {it.title}
        {it.description && (
          <div className="sub">{it.description}</div>
        )}
      </div>
      <div className="dates">
        {it.start_at
          ? new Date(it.start_at).toLocaleDateString()
          : '—'}
        {it.end_at ? ` → ${new Date(it.end_at).toLocaleDateString()}` : ''}
      </div>
      <div className="right">
        <StatusPill status={it.status} />
      </div>
    </div>
  );
}

function IterationsTab({ projectId }: { projectId: string }) {
  const { data: iterations = [], isLoading, isError } = useProjectIterations(projectId);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) return <LoadingState message="Loading iterations…" />;
  if (isError) return <ErrorState message="Failed to load iterations." />;

  const sorted = [...iterations].sort((a, b) => a.position - b.position);

  return (
    <div className="page-wrap">
      {createOpen && <CreateIterationDialog projectId={projectId} onClose={() => setCreateOpen(false)} />}
      <div className="section-h" style={{ marginBottom: 4 }}>
        <h2>Iterations</h2>
        <span className="meta">{iterations.length} total</span>
        <div className="right">
          <button className="top-btn primary" onClick={() => setCreateOpen(true)}>+ New iteration</button>
        </div>
      </div>
      {sorted.length === 0 ? <EmptyState message="No iterations yet." /> : (
        <div className="iter-list">
          {sorted.map(it => <IterationRow key={it.id} iteration={it} />)}
        </div>
      )}
    </div>
  );
}

// ─── Artifacts Tab ───────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactCard({ artifact: a, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  const deleteArtifact = useDeleteArtifact(a.project_id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="arti" style={{ cursor: 'pointer' }}>
      <div className="ahead" onClick={onOpen}>
        <ArtifactThumbnail artifact={a} />
        <span className="tt">{(a.content_type?.split('/')[1] ?? a.type ?? 'file').toUpperCase()}</span>
        {a.processing_status !== 'done' && (
          <span style={{ position: 'absolute', top: 6, right: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--warn)', background: 'var(--surface)', padding: '1px 4px', borderRadius: 3, border: '1px solid var(--line)', textTransform: 'uppercase', zIndex: 2 }}>
            {a.processing_status}
          </span>
        )}
      </div>
      <div className="ameta">
        <div className="aname" onClick={onOpen}>{a.filename}</div>
        <div className="asub">
          {a.content_type ?? 'unknown'}
          {a.size_bytes != null && ` · ${formatBytes(a.size_bytes)}`}
        </div>
        <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
          {confirmDelete ? (
            <>
              <button
                className="top-btn"
                style={{ fontSize: 11, color: 'var(--bad)', padding: '2px 6px' }}
                onClick={() => void deleteArtifact.mutate(a.id)}
                disabled={deleteArtifact.isPending}
              >
                {deleteArtifact.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button className="top-btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <button
              className="icon-btn"
              style={{ fontSize: 10, color: 'var(--muted-2)', padding: '2px 4px' }}
              onClick={() => setConfirmDelete(true)}
              title="Delete artifact"
            >✕</button>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtifactsTab({ projectId }: { projectId: string }) {
  const { data: artifacts = [], isLoading, isError } = useProjectArtifacts(projectId);
  const [selected, setSelected] = useState<Artifact | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  if (isLoading) return <LoadingState message="Loading artifacts…" />;
  if (isError) return <ErrorState message="Failed to load artifacts." />;

  return (
    <div className="page-wrap wide">
      {selected && (
        <ArtifactDetailModal artifact={selected} onClose={() => setSelected(null)} />
      )}

      <div className="section-h" style={{ marginBottom: 14 }}>
        <h2>Artifacts</h2>
        <span className="meta">{artifacts.length} total</span>
        <div className="right">
          <button className="top-btn primary" onClick={() => setUploadOpen(o => !o)}>
            {uploadOpen ? '− Close upload' : '+ Upload artifact'}
          </button>
        </div>
      </div>

      {uploadOpen && (
        <div style={{ marginBottom: 20 }}>
          <ArtifactUpload
            projectId={projectId}
            onDone={() => setUploadOpen(false)}
          />
        </div>
      )}

      {artifacts.length === 0 ? (
        <EmptyState message="No artifacts yet. Upload one above." />
      ) : (
        <div className="arti-grid">
          {artifacts.map(a => (
            <ArtifactCard key={a.id} artifact={a} onOpen={() => setSelected(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ProjectDetailSearch {
  tab?: Tab;
}

const TAB_IDS = new Set<Tab>(TABS.map(t => t.id));

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const search = useSearch({ strict: false }) as ProjectDetailSearch;
  const router = useRouter();
  const { data: project, isLoading, isError } = useProject(projectId);
  const { data: samples = [] } = useProjectSamples(projectId);
  const { data: experiments = [] } = useProjectExperiments(projectId);
  const { data: iterations = [] } = useProjectIterations(projectId);
  const { data: artifacts = [] } = useProjectArtifacts(projectId);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // URL search param is the single source of truth for the active tab.
  // Unknown values (e.g. a hand-typed ?tab=settings) fall back to overview
  // so the content area is never blank.
  const currentTab: Tab = search.tab && TAB_IDS.has(search.tab) ? search.tab : 'overview';
  const setTab = (tab: Tab) => {
    void router.navigate({
      to: '/projects/$projectId',
      params: { projectId },
      search: { tab },
    });
  };

  const crumbs = [
    { label: 'Workspaces', href: '/workspaces' },
    { label: project?.name ?? 'Project' },
  ];

  const counts: Partial<Record<Tab, number>> = {
    samples: samples.length || undefined,
    experiments: experiments.length || undefined,
    iterations: iterations.length || undefined,
    artifacts: artifacts.length || undefined,
  };

  const topBarActions = (
    <button
      className="top-btn primary"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
      onClick={() => setAiPanelOpen(o => !o)}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#fff',
          opacity: 0.85,
          flexShrink: 0,
        }}
      />
      Ask AI
    </button>
  );

  return (
    <AppShell
      activeProjectId={projectId}
      topBarCrumbs={crumbs}
      topBarActions={topBarActions}
    >
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Failed to load project." />
      ) : (
        <>
          <TabBar
            active={currentTab as Tab}
            onChange={setTab}
            counts={counts}
          />
          <div className="content" style={{ padding: 0 }}>
            {currentTab === 'overview' && <OverviewTab projectId={projectId} />}
            {currentTab === 'samples' && <SamplesTab projectId={projectId} />}
            {currentTab === 'experiments' && <ExperimentsTab projectId={projectId} />}
            {currentTab === 'iterations' && <IterationsTab projectId={projectId} />}
            {currentTab === 'artifacts' && <ArtifactsTab projectId={projectId} />}
            {currentTab === 'timeline' && (
              <ProjectTimeline
                projectId={projectId}
                projectName={project?.name ?? 'Project'}
              />
            )}
            {currentTab === 'pages' && (
              <div className="page-wrap">
                <PagesPanel
                  projectId={projectId}
                  parentType="project"
                  parentId={projectId}
                />
              </div>
            )}
            {currentTab === 'workflows' && (
              <div className="page-wrap">
                <WorkflowRunner projectId={projectId} />
              </div>
            )}
            {currentTab === 'ai' && (
              <div className="page-wrap">
                <div
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    marginBottom: 24,
                  }}
                >
                  <div
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--line)',
                      background: 'var(--paper-2)',
                      fontFamily: 'var(--sans)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-2)',
                    }}
                  >
                    Project AI Settings
                  </div>
                  <div style={{ padding: '20px 20px', background: 'var(--surface)' }}>
                    <ProjectAutonomySection
                      projectId={projectId}
                      workspaceId={project?.workspace_id ?? ''}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {aiPanelOpen && (
        <AIChatPanel
          projectId={projectId}
          onClose={() => setAiPanelOpen(false)}
        />
      )}
    </AppShell>
  );
}
