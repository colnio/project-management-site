/**
 * TemplateDetailPage — /templates/$workflowKey
 * Workflow definition page. Shows header, scope, description.
 * Full step/prompt definitions not exposed by API — deviation noted.
 */
import { useParams } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { useWorkflows } from '@/hooks/useAIQueries';
import type { AIWorkflow } from '@/hooks/useAIQueries';

// ─── Scope pill ───────────────────────────────────────────────────────────────

function ScopePill({ scope }: { scope: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    project: { bg: 'var(--pill-planned-bg)', fg: 'var(--pill-planned-fg)' },
    sample: { bg: 'var(--pill-electrode-bg)', fg: 'var(--pill-electrode-fg)' },
    experiment: { bg: 'var(--pill-active-bg)', fg: 'var(--pill-active-fg)' },
  };
  const c = colors[scope] ?? { bg: 'var(--paper-2)', fg: 'var(--muted)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 99,
        fontSize: 11.5,
        fontFamily: 'var(--mono)',
        background: c.bg,
        color: c.fg,
        border: '1px solid transparent',
      }}
    >
      Scope: {scope}
    </span>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-2)', paddingTop: 2 }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Workflow detail view ──────────────────────────────────────────────────────

function WorkflowDetail({ wf }: { wf: AIWorkflow }) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 10,
            background: 'var(--ember-tint)',
            color: 'var(--ember)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 700,
            flexShrink: 0,
            border: '1px solid var(--ember-soft)',
          }}
        >
          {wf.scope === 'project' ? 'P' : wf.scope === 'sample' ? 'S' : 'E'}
        </div>
        <div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 8px' }}>
            {wf.title}
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ScopePill scope={wf.scope} />
            <span className="pill" style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{wf.key}</span>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
          <div style={{ fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-2)' }}>
            Definition
          </div>
        </div>
        <div style={{ padding: '0 16px 4px', background: 'var(--surface)' }}>
          <FieldRow label="Key">
            <code style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ember)' }}>{wf.key}</code>
          </FieldRow>
          <FieldRow label="Scope">
            <span style={{ fontSize: 13.5 }}>{wf.scope}</span>
          </FieldRow>
          <FieldRow label="Description">
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{wf.description}</p>
          </FieldRow>
          <FieldRow label="Steps">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-2)', fontStyle: 'italic' }}>
              Step definitions are not exposed by the current API. Run history is not yet available.
              {/* Deviation: GET /v1/ai/workflows lacks steps/prompt details */}
            </div>
          </FieldRow>
        </div>
      </div>

      {/* How to use callout */}
      <div className="editorial-callout">
        <div className="editorial-callout-label">How to use</div>
        <div className="editorial-callout-title">{wf.title}</div>
        <div className="editorial-callout-desc">
          Navigate to a {wf.scope}, open the AI panel, and select this workflow. The AI will
          run through the risk-assessment steps and generate a structured report with ratings
          and mitigation suggestions.
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TemplateDetailPage() {
  const { workflowKey } = useParams({ from: '/auth/templates/$workflowKey' });
  const { data: workflows = [], isLoading, isError } = useWorkflows();

  const wf = workflows.find(w => w.key === workflowKey);

  const crumbs = [
    { label: 'Templates', href: '/templates' },
    { label: wf?.title ?? workflowKey },
  ];

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        {isLoading && <LoadingState message="Loading template…" />}
        {isError && <ErrorState message="Failed to load templates." />}
        {!isLoading && !isError && !wf && (
          <EmptyState message={`Template "${workflowKey}" not found.`} />
        )}
        {!isLoading && !isError && wf && <WorkflowDetail wf={wf} />}
      </div>
    </AppShell>
  );
}
