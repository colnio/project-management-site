/**
 * ExperimentDashboard — editable dashboard for an experiment.
 * Props: { experimentId: string }
 * Renders editable name, status, tags, time range, parameters, linked samples,
 * result summary, plus method-aware artifact embeds.
 * Rendered as an entityDashboard block within the experiment's page editor.
 */

import { useState } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import {
  useExperiment,
  useUpdateExperiment,
  useExperimentSamples,
  useProjectExperimentTags,
  useProjectSamples,
  useLinkExperimentSample,
  useUnlinkExperimentSample,
} from '@/hooks/useQueries';
import {
  useExperimentArtifacts,
  useArtifact,
} from '@/hooks/useArtifactQueries';
import { ArtImage, ArtPDF, ArtNotebook, ArtEmbed } from '@/components/embeds/ArtEmbeds';
import type { Artifact, Sample } from '@/api/types';
import { experimentDisplayTags } from '@/api/types';
import type { ExperimentSample } from '@/hooks/useQueries';
import { PropertyEditor } from '@/components/PropertyEditor';
import { SampleSelectList } from '@/components/experiments/SampleSelectList';
import { isoToDatetimeLocal, datetimeLocalToIso } from '@/lib/formatDate';

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

// ─── Linked sample row (editable: unlink) ─────────────────────────────────────

function LinkedSampleRow({ item, label, onUnlink, busy }: {
  item: ExperimentSample;
  label: string;
  onUnlink: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)', flex: '0 0 auto' }}>
        {label}
      </span>
      {item.role && <span className="pill">{item.role}</span>}
      {item.note && <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1 }}>{item.note}</span>}
      <button
        onClick={onUnlink}
        className="icon-btn"
        title="Unlink sample"
        disabled={busy}
        style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--bad)', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

const STATUSES = ['planned', 'in_progress', 'completed', 'failed'] as const;
type ExpStatus = typeof STATUSES[number];

const fieldLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8,
};

// ─── ExperimentDashboard ──────────────────────────────────────────────────────

export function ExperimentDashboard({ experimentId }: { experimentId: string }) {
  const { data: experiment, isLoading, isError } = useExperiment(experimentId);
  const { data: linkedSamples = [] } = useExperimentSamples(experimentId);
  const projectId = experiment?.project_id ?? '';
  const { data: tags = [] } = useProjectExperimentTags(projectId || undefined);
  const { data: projectSamples = [] } = useProjectSamples(projectId || undefined);
  const updateExp = useUpdateExperiment(experimentId, projectId);
  const linkSample = useLinkExperimentSample(experimentId);
  const unlinkSample = useUnlinkExperimentSample(experimentId);

  // Local draft state for free-text fields (saved on blur).
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [addingSample, setAddingSample] = useState(false);

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

  const assignedTags = experimentDisplayTags(experiment);

  const toggleTag = (label: string) => {
    const next = assignedTags.includes(label)
      ? assignedTags.filter(t => t !== label)
      : [...assignedTags, label];
    void updateExp.mutateAsync({ tags: next });
  };

  const saveTitle = () => {
    if (titleDraft === null || titleDraft === experiment.title) { setTitleDraft(null); return; }
    void updateExp.mutateAsync({ title: titleDraft.trim() });
    setTitleDraft(null);
  };

  const saveSummary = () => {
    if (summaryDraft === null || summaryDraft === experiment.result_summary) { setSummaryDraft(null); return; }
    void updateExp.mutateAsync({ result_summary: summaryDraft });
    setSummaryDraft(null);
  };

  const saveParameters = (next: Record<string, unknown>) => {
    void updateExp.mutateAsync({ parameters: next });
  };

  const saveTime = (which: 'started_at' | 'ended_at', val: string) => {
    const iso = datetimeLocalToIso(val);
    if (!iso) return; // clearing a timestamp is not supported yet — ignore empties
    void updateExp.mutateAsync({ [which]: iso } as { started_at?: string; ended_at?: string });
  };

  // Map sample_id → human label for linked rows.
  const sampleLabel = (id: string) => {
    const s = projectSamples.find((x: Sample) => x.id === id);
    if (!s) return id.slice(0, 8);
    return s.name ? `${s.identifier} · ${s.name}` : s.identifier;
  };

  const linkedIds = linkedSamples.map(s => s.sample_id);

  return (
    <div>
      {/* Header / Name */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '3px 10px 3px 4px', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--ember)', letterSpacing: '-0.01em' }}>
            {(experiment as unknown as { code?: string }).code ?? experiment.id.slice(0, 8)}
          </span>
          {assignedTags.map(label => (
            <span key={label} className="pill">{label}</span>
          ))}
          <StatusPill status={experiment.status} />
        </div>
        <div style={fieldLabelStyle}>Name</div>
        <input
          className="field-input"
          value={titleDraft ?? experiment.title}
          placeholder="Untitled experiment"
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ width: '100%', fontFamily: 'var(--serif)', fontSize: 20 }}
        />
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

      {/* Tag assignment */}
      <div className="section-h"><h2>Tags</h2></div>
      {tags.length === 0 ? (
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>
          No project tags yet — add tags from the project Experiments tab (Manage tags).
        </p>
      ) : (
        <div className="choice-row" style={{ marginBottom: 20 }}>
          {tags.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.label)}
              className={`status-opt${assignedTags.includes(t.label) ? ' sel' : ''}`}
              aria-pressed={assignedTags.includes(t.label)}
              disabled={updateExp.isPending}
            >
              <span className="pill">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Orphan tags: assigned but no longer defined for the project — give an
          explicit remove control so they can never get stuck. */}
      {(() => {
        const orphans = assignedTags.filter(label => !tags.some(t => t.label === label));
        if (orphans.length === 0) return null;
        return (
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
              Tags no longer defined for this project — click to remove:
            </p>
            <div className="choice-row">
              {orphans.map(label => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleTag(label)}
                  className="status-opt sel"
                  disabled={updateExp.isPending}
                  title="Remove this tag"
                >
                  <span className="pill">{label} ✕</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Time range */}
      <div className="section-h"><h2>Time range</h2></div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={fieldLabelStyle}>Start</div>
          <input
            type="datetime-local"
            className="field-input"
            defaultValue={isoToDatetimeLocal(experiment.started_at)}
            onChange={e => saveTime('started_at', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={fieldLabelStyle}>End</div>
          <input
            type="datetime-local"
            className="field-input"
            defaultValue={isoToDatetimeLocal(experiment.ended_at)}
            onChange={e => saveTime('ended_at', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Artifact embeds */}
      <ExperimentArtifactEmbeds experimentId={experimentId} method={experiment.method as string} />

      {/* Parameters (editable) */}
      <div className="section-h" style={{ marginTop: 0 }}><h2>Parameters</h2></div>
      <div style={{ marginBottom: 24 }}>
        <PropertyEditor properties={params} onChange={saveParameters} />
      </div>

      {/* Linked samples (editable) */}
      <div className="section-h">
        <h2>Samples</h2>
        <span className="meta">{linkedSamples.length}</span>
        <div className="right">
          <button type="button" className="top-btn" onClick={() => setAddingSample(v => !v)}>
            {addingSample ? 'Done' : '+ Add sample'}
          </button>
        </div>
      </div>
      {addingSample && (
        <div style={{ marginBottom: 16 }}>
          <SampleSelectList
            projectId={projectId}
            selectedIds={new Set()}
            excludeIds={linkedIds}
            onToggle={id => { void linkSample.mutateAsync({ sample_id: id }); }}
            maxHeight={200}
          />
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>Click a sample to link it.</p>
        </div>
      )}
      {linkedSamples.length === 0 ? (
        <EmptyState message="No samples linked." />
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          {linkedSamples.map(s => (
            <LinkedSampleRow
              key={s.sample_id}
              item={s}
              label={sampleLabel(s.sample_id)}
              busy={unlinkSample.isPending}
              onUnlink={() => { void unlinkSample.mutateAsync(s.sample_id); }}
            />
          ))}
        </div>
      )}

      {/* Result summary (editable) */}
      <div className="section-h"><h2>Result summary</h2></div>
      <textarea
        className="field-input"
        value={summaryDraft ?? experiment.result_summary}
        placeholder="What did this experiment show?"
        onChange={e => setSummaryDraft(e.target.value)}
        onBlur={saveSummary}
        rows={3}
        style={{ width: '100%', resize: 'vertical', marginBottom: 24 }}
      />

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
