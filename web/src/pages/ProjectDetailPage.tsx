import { useState } from 'react';
import { useParams, useSearch } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import {
  useProject,
  useProjectSamples,
  useProjectExperiments,
  useProjectIterations,
  useProjectArtifacts,
} from '@/hooks/useQueries';
import type { Sample, Experiment, Iteration, Artifact } from '@/api/types';

type Tab = 'overview' | 'samples' | 'experiments' | 'iterations' | 'artifacts';

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  counts: Partial<Record<Tab, number>>;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'iterations', label: 'Iterations' },
  { id: 'samples', label: 'Samples' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'artifacts', label: 'Artifacts' },
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

// ─── Samples Tab ─────────────────────────────────────────────────────────────

function SampleCard({ sample: s }: { sample: Sample }) {
  return (
    <div className="rec">
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
  if (isLoading) return <LoadingState message="Loading samples…" />;
  if (isError) return <ErrorState message="Failed to load samples." />;
  if (samples.length === 0) return <EmptyState message="No samples yet." />;

  return (
    <div className="page-wrap wide">
      <div className="section-h" style={{ marginBottom: 18 }}>
        <h2>Samples</h2>
        <span className="meta">{samples.length} total</span>
      </div>
      <div className="records three">
        {samples.map(s => <SampleCard key={s.id} sample={s} />)}
      </div>
    </div>
  );
}

// ─── Experiments Tab ─────────────────────────────────────────────────────────

function ExperimentCard({ experiment: e }: { experiment: Experiment }) {
  return (
    <div className="rec">
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
  if (isLoading) return <LoadingState message="Loading experiments…" />;
  if (isError) return <ErrorState message="Failed to load experiments." />;
  if (experiments.length === 0) return <EmptyState message="No experiments yet." />;

  return (
    <div className="page-wrap wide">
      <div className="section-h" style={{ marginBottom: 18 }}>
        <h2>Experiments</h2>
        <span className="meta">{experiments.length} total</span>
      </div>
      <div className="records three">
        {experiments.map(e => <ExperimentCard key={e.id} experiment={e} />)}
      </div>
    </div>
  );
}

// ─── Iterations Tab ──────────────────────────────────────────────────────────

function IterationRow({ iteration: it }: { iteration: Iteration }) {
  return (
    <div className="iter-row">
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
  if (isLoading) return <LoadingState message="Loading iterations…" />;
  if (isError) return <ErrorState message="Failed to load iterations." />;
  if (iterations.length === 0) return <EmptyState message="No iterations yet." />;

  return (
    <div className="page-wrap">
      <div className="section-h" style={{ marginBottom: 4 }}>
        <h2>Iterations</h2>
        <span className="meta">{iterations.length} total</span>
      </div>
      <div className="iter-list">
        {iterations.map(it => <IterationRow key={it.id} iteration={it} />)}
      </div>
    </div>
  );
}

// ─── Artifacts Tab ───────────────────────────────────────────────────────────

function ArtifactCard({ artifact: a }: { artifact: Artifact }) {
  return (
    <div className="arti">
      <div className="ahead">
        <div className="ph-stripes" />
        <span className="tt">{a.content_type?.split('/')[1]?.toUpperCase() ?? 'FILE'}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)', position: 'relative', zIndex: 1 }}>
          {a.filename}
        </span>
      </div>
      <div className="ameta">
        <div className="aname">{a.filename}</div>
        <div className="asub">
          {a.content_type ?? 'unknown'}
          {a.size_bytes != null && ` · ${formatBytes(a.size_bytes)}`}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactsTab({ projectId }: { projectId: string }) {
  const { data: artifacts = [], isLoading, isError } = useProjectArtifacts(projectId);
  if (isLoading) return <LoadingState message="Loading artifacts…" />;
  if (isError) return <ErrorState message="Failed to load artifacts." />;
  if (artifacts.length === 0) return <EmptyState message="No artifacts yet." />;

  return (
    <div className="page-wrap wide">
      <div className="section-h" style={{ marginBottom: 18 }}>
        <h2>Artifacts</h2>
        <span className="meta">{artifacts.length} total</span>
      </div>
      <div className="arti-grid">
        {artifacts.map(a => <ArtifactCard key={a.id} artifact={a} />)}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ProjectDetailSearch {
  tab?: Tab;
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const search = useSearch({ strict: false }) as ProjectDetailSearch;
  const { data: project, isLoading, isError } = useProject(projectId);
  const { data: samples = [] } = useProjectSamples(projectId);
  const { data: experiments = [] } = useProjectExperiments(projectId);
  const { data: iterations = [] } = useProjectIterations(projectId);
  const { data: artifacts = [] } = useProjectArtifacts(projectId);

  const activeTab: Tab = search.tab ?? 'overview';
  const [_tab, setTab] = useState<Tab>(activeTab);
  const currentTab = search.tab ?? _tab;

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

  return (
    <AppShell
      activeProjectId={projectId}
      topBarCrumbs={crumbs}
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
          </div>
        </>
      )}
    </AppShell>
  );
}
