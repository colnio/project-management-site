/**
 * G7 — Workflow Runner
 * Pick a workflow, choose a target (project / sample / experiment), run it,
 * and render the result with overall_rating, category_ratings, mitigations,
 * flagged_for_PI_review badge, and a link to result_page_id.
 */
import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useWorkflows, useRunWorkflow } from '@/hooks/useAIQueries';
import { useProjectSamples, useProjectExperiments } from '@/hooks/useQueries';
import type { AIRun, WorkflowOutput } from '@/hooks/useAIQueries';
import { LoadingState, ErrorState } from '@/components/LoadingState';

// ─── Rating display ───────────────────────────────────────────────────────────

const RATING_COLORS: Record<string, string> = {
  low: 'var(--good)',
  medium: 'var(--warn)',
  high: 'var(--bad)',
  critical: 'var(--bad)',
};

// Workflows emit numeric ratings (integer 1-5); older/string sources emit
// low/medium/high. Resolve either form to a color + display string so the badge
// renders correctly (and never calls a string method on a number).
function resolveRating(rating: string | number): { color: string; display: string } {
  if (typeof rating === 'number') {
    const color = rating >= 4 ? 'var(--bad)' : rating === 3 ? 'var(--warn)' : 'var(--good)';
    return { color, display: `${rating}/5` };
  }
  const color = RATING_COLORS[String(rating).toLowerCase()] ?? 'var(--muted)';
  return { color, display: String(rating) };
}

function RatingBadge({ label, rating }: { label: string; rating: string | number }) {
  const { color, display } = resolveRating(rating);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 99,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        color,
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label && <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>{label}:</span>}
      {display}
    </span>
  );
}

// ─── Result panel ─────────────────────────────────────────────────────────────

interface RunResultProps {
  run: AIRun;
  onRerun: () => void;
}

function RunResult({ run, onRerun }: RunResultProps) {
  const router = useRouter();
  const output: WorkflowOutput = run.output ?? {};

  const overallRating = output.overall_rating as string | number | undefined;
  const categoryRatings = output.category_ratings as Record<string, string | number> | undefined;
  const mitigations = output.mitigations as string[] | undefined;
  const flaggedForPI = output.flagged_for_PI_review as boolean | undefined;
  const summary = output.summary as string | undefined;

  if (run.status === 'failed') {
    return (
      <div
        style={{
          background: 'var(--pill-blocked-bg)',
          border: '1px solid var(--pill-blocked-bd)',
          borderRadius: 8,
          padding: '16px 18px',
          color: 'var(--bad)',
          fontFamily: 'var(--mono)',
          fontSize: 12.5,
        }}
      >
        Workflow failed. Please try again.
        <div style={{ marginTop: 10 }}>
          <button className="top-btn" onClick={onRerun} style={{ fontSize: 12 }}>
            Re-run
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
        marginTop: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--paper-2)',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {run.workflow_key}
        </span>
        {overallRating && (
          <RatingBadge label="Overall" rating={overallRating} />
        )}
        {flaggedForPI && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 8px',
              borderRadius: 99,
              background: 'var(--pill-blocked-bg)',
              border: '1px solid var(--pill-blocked-bd)',
              color: 'var(--bad)',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            PI Review Required
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {run.result_page_id && (
            <button
              className="top-btn"
              style={{ fontSize: 11 }}
              onClick={() =>
                void router.navigate({ to: '/pages/$pageId', params: { pageId: run.result_page_id! } })
              }
            >
              View full report →
            </button>
          )}
          <button className="top-btn" onClick={onRerun} style={{ fontSize: 11 }}>
            Re-run
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px', background: 'var(--surface)' }}>
        {/* Summary */}
        {summary && (
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--ink)',
              margin: '0 0 16px',
            }}
          >
            {summary}
          </p>
        )}

        {/* Category ratings */}
        {categoryRatings && Object.keys(categoryRatings).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 8,
              }}
            >
              Category ratings
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(categoryRatings).map(([cat, rating]) => (
                <RatingBadge key={cat} label={cat} rating={rating} />
              ))}
            </div>
          </div>
        )}

        {/* Mitigations */}
        {mitigations && mitigations.length > 0 && (
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 8,
              }}
            >
              Mitigations
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
              {mitigations.map((m, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Raw output for custom workflows */}
        {!summary && !overallRating && !mitigations && (
          <pre
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11.5,
              color: 'var(--ink-2)',
              background: 'var(--paper-2)',
              padding: 12,
              borderRadius: 6,
              overflow: 'auto',
              margin: 0,
            }}
          >
            {JSON.stringify(output, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WorkflowRunnerProps {
  projectId: string;
  /** Limit to workflows with this scope (e.g. "sample" on SampleDetailPage) */
  defaultSampleId?: string;
  defaultExperimentId?: string;
}

export function WorkflowRunner({ projectId, defaultSampleId, defaultExperimentId }: WorkflowRunnerProps) {
  const { data: workflows = [], isLoading: wfLoading, isError: wfError } = useWorkflows();
  const { data: samples = [] } = useProjectSamples(projectId);
  const { data: experiments = [] } = useProjectExperiments(projectId);
  const runWorkflow = useRunWorkflow();

  const [selectedKey, setSelectedKey] = useState('');
  const [targetType, setTargetType] = useState<'project' | 'sample' | 'experiment'>('project');
  const [sampleId, setSampleId] = useState(defaultSampleId ?? '');
  const [experimentId, setExperimentId] = useState(defaultExperimentId ?? '');
  const [lastRun, setLastRun] = useState<AIRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const selectedWorkflow = workflows.find(w => w.key === selectedKey);

  const handleRun = async () => {
    if (!selectedKey) return;
    setRunError(null);
    setLastRun(null);

    try {
      const result = await runWorkflow.mutateAsync({
        key: selectedKey,
        project_id: projectId,
        sample_id: targetType === 'sample' && sampleId ? sampleId : undefined,
        experiment_id: targetType === 'experiment' && experimentId ? experimentId : undefined,
      });
      setLastRun(result);
    } catch (err) {
      setRunError((err as Error).message ?? 'Workflow failed');
    }
  };

  if (wfLoading) return <LoadingState message="Loading workflows…" />;
  if (wfError) return <ErrorState message="Failed to load workflows." />;

  return (
    <div>
      {/* Workflow picker */}
      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--paper-2)',
            fontFamily: 'var(--sans)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
          } as React.CSSProperties}
        >
          AI Workflows
        </div>
        <div style={{ padding: '16px 18px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Workflow select */}
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: 6,
              }}
            >
              Workflow
            </div>
            <select
              className="field-input"
              value={selectedKey}
              onChange={e => setSelectedKey(e.target.value)}
            >
              <option value="">Select a workflow…</option>
              {workflows.map(w => (
                <option key={w.key} value={w.key}>
                  {w.title}
                </option>
              ))}
            </select>
            {selectedWorkflow?.description && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                {selectedWorkflow.description}
              </div>
            )}
          </div>

          {/* Target */}
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: 6,
              }}
            >
              Target
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {(['project', 'sample', 'experiment'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTargetType(t)}
                  className={`status-opt${targetType === t ? ' sel' : ''}`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {targetType === 'sample' && (
              <select
                className="field-input"
                value={sampleId}
                onChange={e => setSampleId(e.target.value)}
              >
                <option value="">Select sample…</option>
                {samples.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.identifier} {s.name ? `— ${s.name}` : ''}
                  </option>
                ))}
              </select>
            )}
            {targetType === 'experiment' && (
              <select
                className="field-input"
                value={experimentId}
                onChange={e => setExperimentId(e.target.value)}
              >
                <option value="">Select experiment…</option>
                {experiments.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.id.slice(0, 8)}… — {e.method}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Run button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="top-btn primary"
              onClick={() => void handleRun()}
              disabled={!selectedKey || runWorkflow.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 7 }}
            >
              {runWorkflow.isPending ? (
                <>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      border: '1.5px solid rgba(255,255,255,0.4)',
                      borderTopColor: '#fff',
                      animation: 'spin 0.7s linear infinite',
                      display: 'inline-block',
                    }}
                  />
                  Running…
                </>
              ) : (
                'Run workflow'
              )}
            </button>
            {runWorkflow.isPending && (
              <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                This may take a moment…
              </span>
            )}
          </div>

          {/* Error */}
          {runError && (
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--pill-blocked-bg)',
                color: 'var(--bad)',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'var(--mono)',
              }}
            >
              Error: {runError}
            </div>
          )}
        </div>
      </div>

      {/* Result */}
      {lastRun && (
        <RunResult
          run={lastRun}
          onRerun={() => void handleRun()}
        />
      )}
    </div>
  );
}
