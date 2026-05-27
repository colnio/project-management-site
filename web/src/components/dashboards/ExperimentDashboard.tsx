/**
 * ExperimentDashboard — standalone dashboard component for an experiment.
 * Props: { experimentId: string }
 * Renders status/method/params summary + linked samples + artifact embeds.
 * Copied from ExperimentDetailPage.tsx body logic (read-only view).
 */

import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import {
  useExperiment,
  useUpdateExperiment,
  useExperimentSamples,
} from '@/hooks/useQueries';
import {
  useExperimentArtifacts,
  useArtifact,
} from '@/hooks/useArtifactQueries';
import { ArtImage, ArtPDF, ArtNotebook, ArtEmbed } from '@/components/embeds/ArtEmbeds';
import type { Artifact } from '@/api/types';
import type { ExperimentSample } from '@/hooks/useQueries';

// ─── Method-specific artifact embed ──────────────────────────────────────────

function MethodArtifactEmbed({ artifact, method }: { artifact: Artifact; method: string }) {
  if (method === 'SEM') return <ArtImage artifact={artifact} />;
  if (method === 'EIS') {
    if (artifact.type === 'pdf') return <ArtPDF artifact={artifact} />;
    if (artifact.type === 'ipynb') return <ArtNotebook artifact={artifact} />;
    return <ArtEmbed artifact={artifact} />;
  }
  if (method === 'cycling') {
    if (artifact.type === 'image') return <ArtImage artifact={artifact} />;
    if (artifact.type === 'ipynb') return <ArtNotebook artifact={artifact} />;
    return <ArtEmbed artifact={artifact} />;
  }
  return <ArtEmbed artifact={artifact} />;
}

function ExperimentArtifactEmbedItem({ artifactId, method }: { artifactId: string; method: string }) {
  const { data: artifact } = useArtifact(artifactId);
  if (!artifact) return null;
  return <MethodArtifactEmbed artifact={artifact} method={method} />;
}

function ExperimentArtifactEmbeds({ experimentId, method }: { experimentId: string; method: string }) {
  const { data: attached = [], isLoading } = useExperimentArtifacts(experimentId);
  if (isLoading || attached.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="section-h" style={{ marginBottom: 12 }}>
        <h2>Artifact Embeds</h2>
        <span className="meta">{attached.length} · {method}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {attached.map(ea => (
          <ExperimentArtifactEmbedItem key={ea.artifact_id} artifactId={ea.artifact_id} method={method} />
        ))}
      </div>
    </div>
  );
}

// ─── Linked sample row (read-only) ────────────────────────────────────────────

function LinkedSampleReadRow({ item }: { item: ExperimentSample }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)', flex: '0 0 auto' }}>
        {item.sample_id.slice(0, 8)}
      </span>
      {item.role && <span className="pill">{item.role}</span>}
      {item.note && <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1 }}>{item.note}</span>}
    </div>
  );
}

// ─── Params display (key-value read view) ────────────────────────────────────

function ParamsDisplay({ params }: { params: Record<string, unknown> }) {
  const entries = Object.entries(params);
  if (entries.length === 0) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-2)' }}>No parameters.</div>;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {entries.map(([key, val]) => (
        <div key={key} style={{ display: 'flex', padding: '8px 14px', borderBottom: '1px solid var(--line)', gap: 12 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)', width: 140, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink)' }}>{typeof val === 'string' ? val : JSON.stringify(val)}</span>
        </div>
      ))}
    </div>
  );
}

const STATUSES = ['planned', 'in_progress', 'completed', 'failed'] as const;
type ExpStatus = typeof STATUSES[number];
const METHODS = ['cycling', 'synthesis', 'SEM', 'XRD', 'EIS', 'weighing', 'drying', 'custom'] as const;

// ─── ExperimentDashboard ──────────────────────────────────────────────────────

export function ExperimentDashboard({ experimentId }: { experimentId: string }) {
  const { data: experiment, isLoading, isError } = useExperiment(experimentId);
  const { data: linkedSamples = [] } = useExperimentSamples(experimentId);
  const updateExp = useUpdateExperiment(experimentId, experiment?.project_id ?? '');

  if (isLoading) return <LoadingState message="Loading experiment dashboard…" />;
  if (isError || !experiment) return <ErrorState message="Failed to load experiment." />;

  const params = (
    experiment.parameters && typeof experiment.parameters === 'object' && !Array.isArray(experiment.parameters)
      ? experiment.parameters as Record<string, unknown>
      : {}
  );

  const handleStatusChange = (s: ExpStatus) => {
    void updateExp.mutateAsync({ status: s });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '3px 10px 3px 4px', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--ember)', letterSpacing: '-0.01em' }}>
            {(experiment as unknown as { code?: string }).code ?? experiment.id.slice(0, 8)}
          </span>
          <span className="pill">{experiment.method}</span>
          <StatusPill status={experiment.status} />
        </div>
        {experiment.result_summary && (
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--ink)', lineHeight: 1.3 }}>
            {experiment.result_summary}
          </div>
        )}
      </div>

      {/* Interactive status toggle */}
      <div className="section-h" style={{ marginTop: 0 }}><h2>Status</h2></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`status-opt${experiment.status === s ? ' sel' : ''}`}
            disabled={updateExp.isPending}
          >
            <StatusPill status={s} />
          </button>
        ))}
      </div>

      {/* Method chips (display only) */}
      <div className="section-h"><h2>Method</h2></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {METHODS.map(m => (
          <span key={m} className="pill" style={{ opacity: experiment.method === m ? 1 : 0.4 }}>{m}</span>
        ))}
      </div>

      {/* Artifact embeds */}
      <ExperimentArtifactEmbeds experimentId={experimentId} method={experiment.method as string} />

      {/* Parameters */}
      <div className="section-h" style={{ marginTop: 0 }}><h2>Parameters</h2></div>
      <div style={{ marginBottom: 24 }}>
        <ParamsDisplay params={params} />
      </div>

      {/* Linked samples */}
      <div className="section-h">
        <h2>Samples</h2>
        <span className="meta">{linkedSamples.length}</span>
      </div>
      {linkedSamples.length === 0 ? (
        <EmptyState message="No samples linked." />
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          {linkedSamples.map(s => (
            <LinkedSampleReadRow key={s.sample_id} item={s} />
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="section-h"><h2>Meta</h2></div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        {[
          { label: 'ID', value: (experiment as unknown as { code?: string }).code ?? experiment.id.slice(0, 16) + '…' },
          { label: 'Created', value: new Date(experiment.created_at).toLocaleDateString() },
          { label: 'Updated', value: new Date(experiment.updated_at).toLocaleDateString() },
          { label: 'Iteration', value: (experiment as unknown as { iteration_id?: string }).iteration_id?.slice(0, 8) ?? '—' },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', padding: '9px 14px', borderBottom: '1px solid var(--line)', gap: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)', width: 70, flexShrink: 0 }}>{r.label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink)' }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
