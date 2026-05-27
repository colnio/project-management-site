import { useState } from 'react';
import { useParams, useSearch, useRouter } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import { ArtifactUpload } from '@/components/ArtifactUpload';
import { ArtifactDetailModal } from '@/components/ArtifactViewer';
import { Avatar } from '@/components/Avatar';
import {
  useProject,
  useProjectSamples,
  useProjectExperiments,
  useProjectIterations,
  useProjectArtifacts,
  useCreateSample,
  useCreateExperiment,
  useWorkspaceMembers,
} from '@/hooks/useQueries';
import { NewIterationWizard } from '@/components/wizards/NewIterationWizard';
import { useDeleteArtifact } from '@/hooks/useArtifactQueries';
import { PagesPanel } from '@/components/PagesPanel';
import { ProjectTimeline } from '@/components/gantt/ProjectTimeline';
import { AIChatPanel } from '@/components/AIChatPanel';
import { WorkflowRunner } from '@/components/WorkflowRunner';
import { ProjectAutonomySection } from '@/components/AutonomyConfig';
import { RiskRegister } from '@/components/RiskRegister';
import { useOverviewLayout, type OverviewLayout } from '@/hooks/useTweaks';
import type { Sample, Experiment, Iteration, Artifact } from '@/api/types';

type Tab = 'overview' | 'samples' | 'experiments' | 'iterations' | 'artifacts' | 'pages' | 'timeline' | 'ai' | 'workflows' | 'calendar';

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
  { id: 'calendar', label: 'Calendar' },
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

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Layout Switcher ──────────────────────────────────────────────────────────

const LAYOUT_OPTS: { id: OverviewLayout; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'stream', label: 'Stream' },
];

function LayoutSwitcher({ value, onChange }: { value: OverviewLayout; onChange: (l: OverviewLayout) => void }) {
  return (
    <div className="overview-layout-seg">
      {LAYOUT_OPTS.map(opt => (
        <button
          key={opt.id}
          className={value === opt.id ? 'active' : ''}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Project Header ───────────────────────────────────────────────────────────

interface ProjectHeaderProps {
  projectId: string;
  onToggleAI?: () => void;
}

function ProjectHeader({ projectId, onToggleAI }: ProjectHeaderProps) {
  const { data: project } = useProject(projectId);
  const { data: members = [] } = useWorkspaceMembers(project?.workspace_id);

  if (!project) return null;

  const leads = members.filter(m => m.role === 'owner' || m.role === 'admin');
  const leadNames = leads.length > 0
    ? leads.map(m => m.user_id.slice(0, 8)).join(', ')
    : null;

  const visIcon = project.visibility === 'private' ? '🔒' : '🌐';
  const visLabel = project.visibility === 'private' ? 'Private' : 'Workspace';

  return (
    <div className="proj-head-rich">
      <div className="proj-head-row1">
        {/* Emblem */}
        <div className="proj-emblem" style={{ width: 52, height: 52, fontSize: 26, flexShrink: 0 }}>
          {project.name[0]?.toUpperCase()}
        </div>

        {/* Main text */}
        <div className="proj-head-meta">
          <div className="proj-title">{project.name}</div>
          <div className="proj-meta-line">
            <span>{visIcon} {visLabel} · all members can read</span>
            {leadNames && (
              <>
                <span className="proj-meta-sep">·</span>
                <span>Leads: {leadNames}</span>
              </>
            )}
          </div>
          <div className="proj-updated">
            Updated {relativeTime(project.updated_at)}
          </div>
        </div>

        {/* Actions */}
        <div className="proj-head-actions">
          {/* Avatar stack (editors = members with role admin/owner) */}
          {members.length > 0 && (
            <div className="avatar-stack" style={{ marginRight: 6 }}>
              {members.slice(0, 4).map(m => (
                <Avatar key={m.id} name={m.user_id.slice(0, 8)} size={26} ring />
              ))}
              {members.length > 4 && (
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'var(--paper-2)',
                    border: '2px solid var(--paper)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 10,
                    color: 'var(--muted)',
                    fontFamily: 'var(--mono)',
                    marginLeft: -6,
                  }}
                >
                  +{members.length - 4}
                </div>
              )}
            </div>
          )}

          <button
            className="top-btn"
            title="Share"
            onClick={() => console.log('Share')}
          >
            Share
          </button>
          <button
            className="icon-btn"
            title="History"
            onClick={() => console.log('History')}
            style={{ fontSize: 15 }}
          >
            ⟳
          </button>
          <button
            className="icon-btn"
            title="More options"
            onClick={() => console.log('More')}
            style={{ fontSize: 16, letterSpacing: 1 }}
          >
            …
          </button>
          {onToggleAI && (
            <button
              className="top-btn primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              onClick={onToggleAI}
              title="Toggle AI panel"
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', opacity: 0.85, flexShrink: 0 }} />
              AI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Body (KPI grid + recent records) ───────────────────────────────

function DashboardBody({
  projectId,
  samples,
  experiments,
  iterations,
  artifacts,
}: {
  projectId: string;
  samples: Sample[];
  experiments: Experiment[];
  iterations: Iteration[];
  artifacts: Artifact[];
}) {
  const stats = [
    { label: 'Samples', value: samples.length },
    { label: 'Iterations', value: iterations.length },
    { label: 'Experiments', value: experiments.length },
    { label: 'Artifacts', value: artifacts.length },
  ];

  return (
    <>
      {/* Stats grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1,
          background: 'var(--line)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          overflow: 'hidden',
          margin: '0 0 24px',
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
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {s.label}
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 28, letterSpacing: '-0.01em', color: 'var(--ink)', lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Risk Register */}
      <RiskRegister projectId={projectId} />

      {/* Recent samples */}
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

      {/* Recent experiments */}
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
    </>
  );
}

// ─── Editorial Body ───────────────────────────────────────────────────────────

function EditorialBody({
  projectId,
  samples,
  experiments,
  iterations,
}: {
  projectId: string;
  samples: Sample[];
  experiments: Experiment[];
  iterations: Iteration[];
}) {
  const { data: project } = useProject(projectId);
  const activeIteration = iterations.find(it => it.status === 'active') ?? iterations[0];

  return (
    <>
      {/* Narrative prose */}
      {project?.description && (
        <div className="summary-prose" style={{ marginBottom: 20 }}>
          <p>{project.description}</p>
        </div>
      )}
      {!project?.description && (
        <div className="summary-prose" style={{ marginBottom: 20, color: 'var(--muted)', fontStyle: 'italic' }}>
          <p>No project description yet. Add one to describe the goals and context of this research project.</p>
        </div>
      )}

      {/* Lead questions callout */}
      <div className="editorial-callout">
        <div className="editorial-callout-label">Lead questions · current iteration</div>
        {activeIteration ? (
          <>
            <div className="editorial-callout-title">{activeIteration.title}</div>
            {activeIteration.description && (
              <div className="editorial-callout-desc">{activeIteration.description}</div>
            )}
          </>
        ) : (
          <div className="editorial-callout-title" style={{ color: 'var(--muted)' }}>
            No active iteration — what hypothesis does this phase test?
          </div>
        )}
      </div>

      {/* Risk Register */}
      <RiskRegister projectId={projectId} />

      {/* Key entities compact list */}
      {(samples.length > 0 || experiments.length > 0 || iterations.length > 0) && (
        <>
          <div className="section-h" style={{ marginTop: 28 }}>
            <h2>Key Entities</h2>
          </div>
          <div className="editorial-entities">
            {iterations.slice(0, 3).map(it => (
              <div key={it.id} className="editorial-entity-row">
                <span className="ent-type">Iteration</span>
                <span className="ent-name">{it.title}</span>
                <StatusPill status={it.status} />
                <span className="ent-ts">{relativeTime(it.updated_at ?? it.created_at)}</span>
              </div>
            ))}
            {samples.slice(0, 3).map(s => (
              <div key={s.id} className="editorial-entity-row">
                <span className="ent-type">Sample</span>
                <span className="ent-name">{s.identifier}{s.name ? ` · ${s.name}` : ''}</span>
                <StatusPill status={s.status} />
                <span className="ent-ts">{relativeTime(s.created_at)}</span>
              </div>
            ))}
            {experiments.slice(0, 3).map(e => (
              <div key={e.id} className="editorial-entity-row">
                <span className="ent-type">Experiment</span>
                <span className="ent-name">{e.result_summary || e.method}</span>
                <StatusPill status={e.status} />
                <span className="ent-ts">{relativeTime(e.performed_at ?? e.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─── Stream Body ──────────────────────────────────────────────────────────────

type StreamItem = {
  id: string;
  type: 'sample' | 'experiment' | 'iteration';
  title: string;
  status: string;
  ts: string;
};

const TYPE_ICON: Record<StreamItem['type'], string> = {
  sample: '⬡',
  experiment: '⚗',
  iteration: '↻',
};

const TYPE_COLOR: Record<StreamItem['type'], string> = {
  sample: 'var(--ref-sample-fg)',
  experiment: 'var(--ref-exp-fg)',
  iteration: 'var(--ember)',
};

function StreamBody({
  samples,
  experiments,
  iterations,
}: {
  samples: Sample[];
  experiments: Experiment[];
  iterations: Iteration[];
}) {
  const items: StreamItem[] = [
    ...samples.map(s => ({
      id: s.id,
      type: 'sample' as const,
      title: `${s.identifier}${s.name ? ` · ${s.name}` : ''}`,
      status: s.status,
      ts: s.created_at,
    })),
    ...experiments.map(e => ({
      id: e.id,
      type: 'experiment' as const,
      title: e.result_summary || e.method,
      status: e.status,
      ts: e.performed_at ?? e.created_at,
    })),
    ...iterations.map(it => ({
      id: it.id,
      type: 'iteration' as const,
      title: it.title,
      status: it.status,
      ts: it.updated_at ?? it.created_at,
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (items.length === 0) {
    return <EmptyState message="No activity yet." />;
  }

  return (
    <div className="stream-feed">
      {items.map(item => (
        <div key={`${item.type}-${item.id}`} className="stream-item">
          <div className="stream-icon" style={{ color: TYPE_COLOR[item.type] }}>
            {TYPE_ICON[item.type]}
          </div>
          <div className="stream-body">
            <div className="stream-title">{item.title}</div>
            <div className="stream-foot">
              <span
                className="pill"
                style={{ fontSize: 10, color: TYPE_COLOR[item.type], background: 'var(--paper-2)' }}
              >
                {item.type}
              </span>
              <StatusPill status={item.status} />
              <span className="stream-ts">{relativeTime(item.ts)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

interface OverviewTabProps {
  projectId: string;
  onToggleAI?: () => void;
}

function OverviewTab({ projectId, onToggleAI }: OverviewTabProps) {
  const { data: project } = useProject(projectId);
  const { data: samples = [] } = useProjectSamples(projectId);
  const { data: experiments = [] } = useProjectExperiments(projectId);
  const { data: iterations = [] } = useProjectIterations(projectId);
  const { data: artifacts = [] } = useProjectArtifacts(projectId);
  const [layout, setLayout] = useOverviewLayout();

  if (!project) return <LoadingState />;

  return (
    <div className="page-wrap">
      {/* Row: layout switcher aligned to top-right */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, marginTop: 8 }}>
        <LayoutSwitcher value={layout} onChange={setLayout} />
      </div>

      {/* Rich header */}
      <ProjectHeader projectId={projectId} onToggleAI={onToggleAI} />

      {/* Description (shown in dashboard layout; editorial shows its own) */}
      {layout === 'dashboard' && project.description && (
        <div className="summary-prose" style={{ marginBottom: 20 }}>
          <p>{project.description}</p>
        </div>
      )}

      {/* Layout body */}
      {layout === 'dashboard' && (
        <DashboardBody
          projectId={projectId}
          samples={samples}
          experiments={experiments}
          iterations={iterations}
          artifacts={artifacts}
        />
      )}
      {layout === 'editorial' && (
        <EditorialBody
          projectId={projectId}
          samples={samples}
          experiments={experiments}
          iterations={iterations}
        />
      )}
      {layout === 'stream' && (
        <>
          <RiskRegister projectId={projectId} />
          <div className="section-h" style={{ marginTop: 20 }}>
            <h2>Activity Stream</h2>
            <span className="meta">{samples.length + experiments.length + iterations.length} items</span>
          </div>
          <StreamBody
            samples={samples}
            experiments={experiments}
            iterations={iterations}
          />
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
          {e.code ?? e.id.slice(0, 8)}
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
  const [wizardOpen, setWizardOpen] = useState(false);

  if (isLoading) return <LoadingState message="Loading iterations…" />;
  if (isError) return <ErrorState message="Failed to load iterations." />;

  const sorted = [...iterations].sort((a, b) => a.position - b.position);

  return (
    <div className="page-wrap">
      {wizardOpen && (
        <NewIterationWizard
          projectId={projectId}
          onClose={() => setWizardOpen(false)}
        />
      )}
      <div className="section-h" style={{ marginBottom: 4 }}>
        <h2>Iterations</h2>
        <span className="meta">{iterations.length} total</span>
        <div className="right">
          <button className="top-btn primary" onClick={() => setWizardOpen(true)}>+ New iteration</button>
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

// Type-specific color tokens for artifact placeholders
const ARTIFACT_TYPE_COLOR: Record<string, string> = {
  pdf: '#c0392b',
  ipynb: '#e67e22',
  image: '#2980b9',
  other: '#7f8c8d',
};

// SVG placeholder glyphs for each artifact type
function ArtifactPlaceholder({ type }: { type: string }) {
  const color = ARTIFACT_TYPE_COLOR[type] ?? ARTIFACT_TYPE_COLOR['other'];

  if (type === 'pdf') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${color}11`,
        }}
      >
        <svg width="44" height="54" viewBox="0 0 44 54" fill="none" aria-hidden>
          <rect x="1.5" y="1.5" width="33" height="43" rx="3" stroke={color} strokeWidth="1.5" opacity="0.5" />
          <path d="M26 1.5v11h11" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.5" />
          <rect x="8" y="24" width="20" height="2" rx="1" fill={color} opacity="0.3" />
          <rect x="8" y="29" width="16" height="2" rx="1" fill={color} opacity="0.3" />
          <rect x="8" y="34" width="18" height="2" rx="1" fill={color} opacity="0.3" />
          <text x="22" y="20" textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill={color} fontWeight="700" opacity="0.7">PDF</text>
        </svg>
      </div>
    );
  }

  if (type === 'ipynb') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: `${color}0d`,
          padding: '8px 10px',
          gap: 4,
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {['#e74c3c', '#f39c12', '#2ecc71'].map((c, i) => (
            <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c, opacity: 0.5 }} />
          ))}
        </div>
        {/* Faux cell rows */}
        {[1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              height: 9,
              borderRadius: 2,
              background: i === 2 ? `${color}22` : `${color}18`,
              borderLeft: `2px solid ${color}`,
              opacity: 0.8 - i * 0.12,
            }}
          />
        ))}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color, opacity: 0.5, textAlign: 'center', marginTop: 4, letterSpacing: '0.04em' }}>
          NOTEBOOK
        </div>
      </div>
    );
  }

  if (type === 'image') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${color}0d`,
        }}
      >
        <svg width="46" height="40" viewBox="0 0 46 40" fill="none" aria-hidden>
          <rect x="1.5" y="1.5" width="43" height="37" rx="4" stroke={color} strokeWidth="1.5" opacity="0.4" />
          <circle cx="14" cy="13" r="5" fill={color} opacity="0.25" />
          <path d="M1.5 27 L12 17 L20 25 L30 14 L44.5 27" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.4" />
        </svg>
      </div>
    );
  }

  // other / fallback
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${color}0d`,
      }}
    >
      <svg width="36" height="46" viewBox="0 0 36 46" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="33" height="43" rx="3" stroke={color} strokeWidth="1.5" opacity="0.4" />
        <path d="M22 1.5v11h12" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.4" />
        <rect x="8" y="22" width="20" height="2" rx="1" fill={color} opacity="0.25" />
        <rect x="8" y="28" width="14" height="2" rx="1" fill={color} opacity="0.25" />
      </svg>
    </div>
  );
}

// Processing shimmer overlay
function ProcessingOverlay({ status }: { status: string }) {
  const isPending = status === 'pending' || status === 'processing';
  if (!isPending) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(var(--paper-rgb, 250,249,246), 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 6,
        backdropFilter: 'blur(1px)',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '2px solid var(--line)',
          borderTopColor: 'var(--ember)',
          animation: 'spin 0.8s linear infinite',
          display: 'inline-block',
        }}
      />
      <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {status}
      </span>
    </div>
  );
}

function ArtifactCard({ artifact: a, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  const deleteArtifact = useDeleteArtifact(a.project_id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeColor = ARTIFACT_TYPE_COLOR[a.type] ?? ARTIFACT_TYPE_COLOR['other'];
  const hasThumbnail = !!a.thumbnail_url;
  const isPending = a.processing_status === 'pending' || a.processing_status === 'processing';

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
      onClick={onOpen}
      title={a.filename}
    >
      {/* Thumbnail / Placeholder */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '4/3',
          background: 'var(--paper-2)',
          overflow: 'hidden',
        }}
      >
        {hasThumbnail ? (
          <img
            src={a.thumbnail_url!}
            alt={a.filename}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <ArtifactPlaceholder type={a.type} />
        )}

        {/* Processing shimmer */}
        {isPending && <ProcessingOverlay status={a.processing_status} />}

        {/* Type chip */}
        <span
          style={{
            position: 'absolute',
            bottom: 6,
            left: 8,
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            color: '#fff',
            background: typeColor,
            padding: '1px 5px',
            borderRadius: 3,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            opacity: 0.92,
          }}
        >
          {a.type}
        </span>
      </div>

      {/* Meta */}
      <div
        style={{ padding: '9px 11px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            fontWeight: 500,
            fontSize: 12.5,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
          onClick={onOpen}
          title={a.filename}
        >
          {a.filename}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {a.size_bytes != null && <span>{formatBytes(a.size_bytes)}</span>}
          {a.processing_status !== 'done' && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: a.processing_status === 'failed' ? 'var(--bad)' : 'var(--warn)',
                background: a.processing_status === 'failed' ? 'var(--pill-blocked-bg)' : 'var(--paper-2)',
                padding: '0 4px',
                borderRadius: 3,
                border: '1px solid var(--line)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {a.processing_status}
            </span>
          )}
        </div>
        {/* Delete affordance */}
        <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
          {confirmDelete ? (
            <>
              <button
                className="top-btn"
                style={{ fontSize: 10.5, color: 'var(--bad)', padding: '2px 6px' }}
                onClick={e => { e.stopPropagation(); void deleteArtifact.mutate(a.id); }}
                disabled={deleteArtifact.isPending}
              >
                {deleteArtifact.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                className="top-btn"
                style={{ fontSize: 10.5, padding: '2px 6px' }}
                onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="icon-btn"
              style={{ fontSize: 10, color: 'var(--muted-2)', padding: '2px 4px' }}
              onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
              title="Delete artifact"
            >
              ✕
            </button>
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
  const [filterType, setFilterType] = useState<string>('');

  if (isLoading) return <LoadingState message="Loading artifacts…" />;
  if (isError) return <ErrorState message="Failed to load artifacts." />;

  const types = Array.from(new Set(artifacts.map((a: Artifact) => a.type)));
  const filtered = filterType ? artifacts.filter((a: Artifact) => a.type === filterType) : artifacts;

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

      {/* Type filter — only show when there are multiple types */}
      {types.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            onClick={() => setFilterType('')}
            className={`status-opt${filterType === '' ? ' sel' : ''}`}
            style={{ fontSize: 12 }}
          >
            All
          </button>
          {types.map(t => (
            <button
              key={t}
              onClick={() => setFilterType(filterType === t ? '' : t)}
              className={`status-opt${filterType === t ? ' sel' : ''}`}
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
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: ARTIFACT_TYPE_COLOR[t] ?? ARTIFACT_TYPE_COLOR['other'],
                    display: 'inline-block',
                  }}
                />
                {t}
              </span>
            </button>
          ))}
        </div>
      )}

      {artifacts.length === 0 ? (
        <EmptyState message="No artifacts yet. Upload one above." />
      ) : filtered.length === 0 ? (
        <EmptyState message={`No ${filterType} artifacts.`} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 14,
          }}
        >
          {filtered.map((a: Artifact) => (
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
      onJumpTab={(tab) => setTab(tab as Tab)}
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
            {currentTab === 'overview' && <OverviewTab projectId={projectId} onToggleAI={() => setAiPanelOpen(o => !o)} />}
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
            {currentTab === 'calendar' && (
              <div className="page-wrap">
                <div className="cal-tab-wrap">
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                    Project Calendar
                  </div>
                  <p style={{ margin: 0, fontSize: 13, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
                    The full calendar view with event management is available on the workspace Calendar page, scoped to this project.
                  </p>
                  <a
                    href="/calendar"
                    className="top-btn primary"
                    style={{ display: 'inline-flex' }}
                  >
                    Open Calendar →
                  </a>
                </div>
              </div>
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
          workspaceId={project?.workspace_id}
          onClose={() => setAiPanelOpen(false)}
        />
      )}
    </AppShell>
  );
}
