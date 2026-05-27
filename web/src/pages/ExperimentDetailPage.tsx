/**
 * C5 — Experiment Detail Page
 * Route: /experiments/:experimentId
 * Header (code/method/status pill row + result summary) + BlockNote editor.
 * Interactive status toggle and method chips now live inside ExperimentDashboard
 * (rendered as an entityDashboard block within the editor).
 */
import { useParams } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import {
  useExperiment,
} from '@/hooks/useQueries';
import { EntityPageEditor } from '@/components/editor/EntityPageEditor';

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ExperimentDetailPage() {
  const { experimentId } = useParams({ strict: false }) as { experimentId: string };
  const { data: experiment, isLoading, isError } = useExperiment(experimentId);

  const crumbs = [
    { label: 'Project', href: experiment ? `/projects/${experiment.project_id}?tab=experiments` : '/workspaces' },
    { label: experiment ? `${experiment.method} experiment` : 'Experiment' },
  ];

  if (isLoading) return <AppShell topBarCrumbs={crumbs}><LoadingState /></AppShell>;
  if (isError || !experiment) return <AppShell topBarCrumbs={crumbs}><ErrorState message="Failed to load experiment." /></AppShell>;

  return (
    <AppShell activeProjectId={experiment.project_id} topBarCrumbs={crumbs}>
      <div className="page-wrap wide" style={{ paddingTop: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }}>
            {/* Code (EX-N) — shown prominently */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                padding: '3px 10px 3px 4px',
                background: 'var(--paper-2)',
                border: '1px solid var(--line)',
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ember)',
                  letterSpacing: '-0.01em',
                }}
              >
                {(experiment as unknown as { code?: string }).code ?? experiment.id.slice(0, 8)}
              </span>
              <span className="pill">{experiment.method}</span>
              <StatusPill status={experiment.status} />
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 4px', lineHeight: 1.25 }}>
              {experiment.result_summary || `${experiment.method} experiment`}
            </h1>
          </div>
        </div>

        {/* Entity page editor (contains entityDashboard block with status/method/params/samples + notes) */}
        <EntityPageEditor
          parentType="experiment"
          parentId={experimentId}
          projectId={experiment.project_id}
        />
      </div>
    </AppShell>
  );
}
