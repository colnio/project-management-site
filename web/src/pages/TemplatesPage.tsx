/**
 * TemplatesPage — /templates
 * Lists AI risk-assessment workflows as cards linking to /templates/$workflowKey.
 */
import { Link } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { useWorkflows } from '@/hooks/useAIQueries';

const SCOPE_ICONS: Record<string, string> = {
  project: 'P',
  sample: 'S',
  experiment: 'E',
};

export function TemplatesPage() {
  const { data: workflows = [], isLoading, isError } = useWorkflows();
  const crumbs = [{ label: 'Templates' }];

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 8px' }}>
            Templates
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            AI-driven workflow templates for risk assessment. Run them from any project or sample.
          </p>
        </div>

        {isLoading && <LoadingState message="Loading templates…" />}
        {isError && <ErrorState message="Failed to load templates." />}

        {!isLoading && !isError && workflows.length === 0 && (
          <EmptyState message="No workflow templates found." />
        )}

        {!isLoading && !isError && workflows.length > 0 && (
          <div className="records three" style={{ gap: 16 }}>
            {workflows.map(wf => (
              <Link
                key={wf.key}
                to="/templates/$workflowKey"
                params={{ workflowKey: wf.key }}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="rec" style={{ cursor: 'default', height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'var(--ember-tint)',
                        color: 'var(--ember)',
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: 'var(--serif)',
                        fontSize: 16,
                        fontWeight: 700,
                        flexShrink: 0,
                        border: '1px solid var(--ember-soft)',
                      }}
                    >
                      {SCOPE_ICONS[wf.scope] ?? 'W'}
                    </div>
                    <div>
                      <div className="name" style={{ fontSize: 13.5, marginBottom: 2 }}>{wf.title}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span className="pill">{wf.scope}</span>
                        <span className="pill" style={{ fontFamily: 'var(--mono)', fontSize: 9.5 }}>{wf.key}</span>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                    {wf.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
