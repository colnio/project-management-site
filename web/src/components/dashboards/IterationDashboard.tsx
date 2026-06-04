/**
 * IterationDashboard — standalone dashboard component for an iteration.
 * Props: { iterationId: string }
 * Renders meta grid + Risk Register + artifact section + linked samples.
 * Copied from IterationDetailPage.tsx body logic.
 */

import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import { RiskRegister } from '@/components/RiskRegister';
import {
  useIteration,
  useIterationSamples,
  useProjectArtifacts,
} from '@/hooks/useQueries';
import { ArtEmbed } from '@/components/embeds/ArtEmbeds';
import type { IterationSample } from '@/hooks/useQueries';
import { TasksTab } from '@/components/tasks/TasksTab';

// ─── Artifact embeds preview ──────────────────────────────────────────────────

function IterationArtifactsPreview({ projectId }: { projectId: string }) {
  const { data: artifacts = [], isLoading } = useProjectArtifacts(projectId);
  if (isLoading || artifacts.length === 0) return null;
  const preview = artifacts.slice(0, 4);
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="section-h" style={{ marginBottom: 12 }}>
        <h2>Project Artifacts</h2>
        <span className="meta">{artifacts.length}</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {preview.map(artifact => (
          <ArtEmbed key={artifact.id} artifact={artifact} />
        ))}
      </div>
      {artifacts.length > 4 && (
        <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
          +{artifacts.length - 4} more in project
        </div>
      )}
    </div>
  );
}

// ─── Linked sample row (read-only view) ──────────────────────────────────────

function LinkedSampleReadRow({ item }: { item: IterationSample }) {
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

// ─── IterationDashboard ───────────────────────────────────────────────────────

export function IterationDashboard({
  iterationId,
  showHeader = false,
}: {
  iterationId: string;
  showHeader?: boolean;
}) {
  const { data: iteration, isLoading, isError } = useIteration(iterationId);
  const { data: linkedSamples = [] } = useIterationSamples(iterationId);

  if (isLoading) return <LoadingState message="Loading iteration dashboard…" />;
  if (isError || !iteration) return <ErrorState message="Failed to load iteration." />;

  const metaFields = [
    { label: 'Start', value: iteration.start_at ? new Date(iteration.start_at).toLocaleDateString() : '—' },
    { label: 'End', value: iteration.end_at ? new Date(iteration.end_at).toLocaleDateString() : '—' },
    { label: 'Samples Linked', value: linkedSamples.length },
  ];

  return (
    <div>
      {/* Header summary — only shown when the parent doesn't render its own header */}
      {showHeader && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', background: 'var(--paper-2)', padding: '2px 7px', borderRadius: 99, border: '1px solid var(--line)' }}>
              #{iteration.position}
            </span>
            <StatusPill status={iteration.status} />
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 4 }}>
            {iteration.title}
          </div>
          {iteration.description && (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              {iteration.description}
            </p>
          )}
        </div>
      )}

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginBottom: 28 }}>
        {metaFields.map(m => (
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

      {/* Tasks */}
      <div style={{ marginBottom: 32 }}>
        <div className="section-h" style={{ marginBottom: 12 }}>
          <h2>Tasks</h2>
        </div>
        <TasksTab projectId={iteration.project_id} iterationId={iterationId} />
      </div>

      {/* Artifact embeds */}
      <IterationArtifactsPreview projectId={iteration.project_id} />

      {/* Linked Samples */}
      <div className="section-h">
        <h2>Linked Samples</h2>
        <span className="meta">{linkedSamples.length} linked</span>
      </div>
      {linkedSamples.length === 0 ? (
        <EmptyState message="No samples linked to this iteration." />
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>
          {linkedSamples.map(item => (
            <LinkedSampleReadRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Timestamps */}
      <div style={{ marginTop: 32, display: 'flex', gap: 24, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
        <span>Created {new Date(iteration.created_at).toLocaleDateString()}</span>
        <span>Updated {new Date(iteration.updated_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
