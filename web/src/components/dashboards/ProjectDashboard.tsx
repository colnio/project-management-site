/**
 * ProjectDashboard — standalone dashboard component for a project.
 * Props: { projectId: string }
 * Renders KPI tiles + Risk Register + recent samples + recent experiments.
 * Copied from ProjectDetailPage.tsx DashboardBody / OverviewTab logic.
 */

import { useRouter } from '@tanstack/react-router';
import { LoadingState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import { RiskRegister } from '@/components/RiskRegister';
import {
  useProject,
  useProjectSamples,
  useProjectExperiments,
  useProjectIterations,
  useProjectArtifacts,
} from '@/hooks/useQueries';
import type { Sample, Experiment } from '@/api/types';
import { experimentDisplayTags } from '@/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
      <div className="foot">
        <StatusPill status={s.status} />
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
          {new Date(s.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

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
          {(e as unknown as { code?: string }).code ?? e.id.slice(0, 8)}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {experimentDisplayTags(e).map(label => (
            <span key={label} className="pill">{label}</span>
          ))}
        </span>
      </div>
      <div className="name">{e.result_summary || e.method}</div>
      <div className="foot">
        <StatusPill status={e.status} />
        {e.performed_at && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
            {new Date(e.performed_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ProjectDashboard ─────────────────────────────────────────────────────────

export function ProjectDashboard({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: samples = [], isLoading: samplesLoading } = useProjectSamples(projectId);
  const { data: experiments = [], isLoading: experimentsLoading } = useProjectExperiments(projectId);
  const { data: iterations = [] } = useProjectIterations(projectId);
  const { data: artifacts = [] } = useProjectArtifacts(projectId);

  if (!project || samplesLoading || experimentsLoading) {
    return <LoadingState message="Loading project dashboard…" />;
  }

  const stats = [
    { label: 'Samples', value: samples.length },
    { label: 'Iterations', value: iterations.length },
    { label: 'Experiments', value: experiments.length },
    { label: 'Artifacts', value: artifacts.length },
  ];

  return (
    <div>
      {/* Description */}
      {project.description && (
        <div className="summary-prose" style={{ marginBottom: 20 }}>
          <p>{project.description}</p>
        </div>
      )}

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
            {samples.slice(0, 4).map((s: Sample) => (
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
            {experiments.slice(0, 4).map((e: Experiment) => (
              <ExperimentCard key={e.id} experiment={e} />
            ))}
          </div>
        </>
      )}

      {/* Last updated */}
      <div style={{ marginTop: 24, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
        Updated {relativeTime(project.updated_at)}
      </div>
    </div>
  );
}
