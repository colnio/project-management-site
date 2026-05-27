/**
 * RiskRegister — displays the project (or iteration) risk table.
 *
 * Props:
 *   projectId   — always required (used for the "Run assessment" button + mutations)
 *   iterationId — when set, shows only risks scoped to that iteration
 *
 * Likelihood pills: HIGH (red) / MED (amber) / LOW (green)
 * Impact headline is color-coded by likelihood severity.
 * Source badge shows "AI" for workflow-generated risks.
 * PI REVIEW chip appears when flagged_for_pi_review === true.
 *
 * Editing:
 *   "+ Add risk" button → RiskFormDialog (create mode)
 *   Per-row pencil icon → RiskFormDialog (edit mode)
 *   Per-row trash icon  → window.confirm → useDeleteRisk
 *   PI-review toggle    → visible only when user.is_system_admin === true
 */
import { useState } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import {
  useProjectRisks,
  useIterationRisks,
  useRunWorkflow,
  useDeleteRisk,
  useSetRiskPIReview,
  type Risk,
} from '@/hooks/useRiskQueries';
import { useQueryClient } from '@tanstack/react-query';
import { riskKeys } from '@/hooks/useRiskQueries';
import { useAuth } from '@/hooks/useAuth';
import { RiskFormDialog } from '@/components/RiskFormDialog';
import { useAIPanel } from '@/components/AIPanelProvider';
import { useProject } from '@/hooks/useQueries';
import { SendForApprovalDialog } from '@/components/SendForApprovalDialog';

// ─── Likelihood pill ─────────────────────────────────────────────────────────

function LikelihoodPill({ value }: { value: Risk['likelihood'] }) {
  return (
    <span className={`risk-pill ${value}`}>
      {value.toUpperCase()}
    </span>
  );
}

// ─── Impact cell ─────────────────────────────────────────────────────────────

const impactColor: Record<Risk['likelihood'], string> = {
  high: 'var(--bad)',
  med: 'var(--warn)',
  low: 'var(--good)',
};

function ImpactCell({ risk }: { risk: Risk }) {
  return (
    <div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 12.5,
          color: impactColor[risk.likelihood],
          lineHeight: 1.3,
          marginBottom: risk.impact_description ? 3 : 0,
        }}
      >
        {risk.impact_headline || risk.title}
      </div>
      {risk.impact_description && (
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'var(--muted)',
            lineHeight: 1.45,
          }}
        >
          {risk.impact_description}
        </div>
      )}
    </div>
  );
}

// ─── Risk row ────────────────────────────────────────────────────────────────

interface RiskRowProps {
  risk: Risk;
  projectId: string;
  isPI: boolean;
  onEdit: (risk: Risk) => void;
}

function RiskRow({ risk, projectId, isPI, onEdit }: RiskRowProps) {
  const deleteRisk = useDeleteRisk(projectId);
  const setPIReview = useSetRiskPIReview(projectId);

  const handleDelete = () => {
    if (window.confirm(`Delete risk "${risk.title}"? This cannot be undone.`)) {
      deleteRisk.mutate(risk.id);
    }
  };

  const handleTogglePIReview = () => {
    setPIReview.mutate({ riskId: risk.id, flagged: !risk.flagged_for_pi_review });
  };

  return (
    <tr style={{ borderBottom: '1px solid var(--line)' }}>
      {/* Seq */}
      <td
        style={{
          padding: '10px 12px',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--muted)',
          whiteSpace: 'nowrap',
          verticalAlign: 'top',
        }}
      >
        #{risk.seq}
      </td>

      {/* Title + badges */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top', minWidth: 160 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--ink)',
              lineHeight: 1.35,
            }}
          >
            {risk.title}
          </span>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {risk.source === 'ai' && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'var(--paper-2)',
                  color: 'var(--muted)',
                  border: '1px solid var(--line)',
                  borderRadius: 99,
                  padding: '1px 5px',
                }}
              >
                AI
              </span>
            )}
            {risk.flagged_for_pi_review && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: '#fce8e4',
                  color: '#9a2a1e',
                  border: '1px solid #f0b8b0',
                  borderRadius: 99,
                  padding: '1px 5px',
                  fontWeight: 700,
                }}
              >
                PI REVIEW
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Likelihood */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        <LikelihoodPill value={risk.likelihood} />
      </td>

      {/* Impact */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top', maxWidth: 240 }}>
        <ImpactCell risk={risk} />
      </td>

      {/* Mitigation / Plan B */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top', maxWidth: 240 }}>
        {risk.mitigation && (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--ink)',
              lineHeight: 1.45,
              marginBottom: risk.plan_b ? 6 : 0,
            }}
          >
            {risk.mitigation}
          </div>
        )}
        {risk.plan_b && (
          <div
            style={{
              fontSize: 11.5,
              fontFamily: 'var(--mono)',
              color: 'var(--muted)',
              lineHeight: 1.4,
            }}
          >
            <span style={{ color: 'var(--muted-2)', marginRight: 4 }}>Plan B:</span>
            {risk.plan_b}
          </div>
        )}
        {!risk.mitigation && !risk.plan_b && (
          <span style={{ fontSize: 12, color: 'var(--muted-2)', fontFamily: 'var(--mono)' }}>—</span>
        )}
      </td>

      {/* Actions */}
      <td
        style={{
          padding: '8px 10px',
          verticalAlign: 'top',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* PI-review toggle — PI only */}
          {isPI && (
            <button
              className="icon-btn"
              onClick={handleTogglePIReview}
              disabled={setPIReview.isPending}
              title={risk.flagged_for_pi_review ? 'Clear PI review flag' : 'Flag for PI review'}
              style={{
                fontSize: 11,
                color: risk.flagged_for_pi_review ? '#9a2a1e' : 'var(--muted-2)',
                padding: '2px 5px',
              }}
            >
              {risk.flagged_for_pi_review ? '⚑' : '⚐'}
            </button>
          )}

          {/* Edit */}
          <button
            className="icon-btn"
            onClick={() => onEdit(risk)}
            title="Edit risk"
            style={{ fontSize: 11, color: 'var(--muted-2)', padding: '2px 5px' }}
          >
            ✎
          </button>

          {/* Delete */}
          <button
            className="icon-btn"
            onClick={handleDelete}
            disabled={deleteRisk.isPending}
            title="Delete risk"
            style={{ fontSize: 11, color: 'var(--muted-2)', padding: '2px 5px' }}
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── RiskRegister ────────────────────────────────────────────────────────────

interface RiskRegisterProps {
  projectId: string;
  iterationId?: string;
}

export function RiskRegister({ projectId, iterationId }: RiskRegisterProps) {
  const qc = useQueryClient();
  const [runError, setRunError] = useState<string | null>(null);

  // Dialog state: null = closed, 'create' = new risk, Risk object = edit mode
  const [dialogState, setDialogState] = useState<null | 'create' | Risk>(null);

  // Send for approval dialog
  const [approvalOpen, setApprovalOpen] = useState(false);

  const { user } = useAuth();
  const isPI = !!user?.is_system_admin;

  // Workspace id needed for stakeholder picker
  const { data: project } = useProject(projectId);

  // AI panel context — degrades gracefully when no provider is present
  const { reviewWithAI } = useAIPanel();

  const handleReviewWithAI = () => {
    const scope = iterationId ? 'iteration' : 'project';
    reviewWithAI(
      'risk_assesment_skill',
      `Begin a structured risk assessment for this ${scope}. Start with Phase 1 (Context Mapping).`,
    );
  };

  const projectResult = useProjectRisks(iterationId ? undefined : projectId);
  const iterationResult = useIterationRisks(iterationId);

  const { data: risks, isLoading, isError } =
    iterationId ? iterationResult : projectResult;

  const runWorkflow = useRunWorkflow();

  const handleRunAssessment = () => {
    setRunError(null);
    runWorkflow.mutate(
      { key: 'project_risk_v1', project_id: projectId },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: riskKeys.projectRisks(projectId) });
          if (iterationId) {
            void qc.invalidateQueries({ queryKey: riskKeys.iterationRisks(iterationId) });
          }
        },
        onError: (err) => {
          setRunError(err instanceof Error ? err.message : 'Workflow failed');
        },
      }
    );
  };

  // Derive latest updated_at for footer.
  const latestUpdate =
    risks && risks.length > 0
      ? risks.reduce((latest, r) =>
          r.updated_at > latest ? r.updated_at : latest, risks[0].updated_at)
      : null;

  return (
    <>
      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 32,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 20px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--paper-2)',
          }}
        >
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--ink-2)',
              }}
            >
              Risk Register
            </span>
            {risks && risks.length > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  fontFamily: 'var(--mono)',
                  fontSize: 10.5,
                  color: 'var(--muted)',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 99,
                  padding: '1px 6px',
                }}
              >
                {risks.length}
              </span>
            )}
          </div>

          {runError && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--bad)',
                maxWidth: 240,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {runError}
            </span>
          )}

          <button
            className="top-btn"
            onClick={() => setDialogState('create')}
            style={{ fontSize: 12 }}
          >
            + Add risk
          </button>

          <button
            className="top-btn"
            onClick={handleRunAssessment}
            disabled={runWorkflow.isPending}
            style={{ fontSize: 12 }}
          >
            {runWorkflow.isPending ? 'Running…' : 'Run risk assessment'}
          </button>

          <button
            className="top-btn"
            onClick={handleReviewWithAI}
            style={{ fontSize: 12 }}
          >
            Review with AI
          </button>

          <button
            className="top-btn"
            onClick={() => setApprovalOpen(true)}
            style={{ fontSize: 12 }}
          >
            Send for approval
          </button>
        </div>

        {/* Body */}
        {isLoading ? (
          <LoadingState message="Loading risks…" />
        ) : isError ? (
          <ErrorState message="Failed to load risks." />
        ) : !risks || risks.length === 0 ? (
          <EmptyState message="No risks recorded. Run a risk assessment or add one manually." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                background: 'var(--surface)',
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--paper-2)',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  {['#', 'Risk', 'Likelihood', 'Impact', 'Mitigation / Plan B', ''].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        color: 'var(--muted-2)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {risks.map(r => (
                  <RiskRow
                    key={r.id}
                    risk={r}
                    projectId={projectId}
                    isPI={isPI}
                    onEdit={risk => setDialogState(risk)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {latestUpdate && (
          <div
            style={{
              padding: '8px 20px',
              borderTop: '1px solid var(--line)',
              background: 'var(--paper-2)',
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--muted-2)',
            }}
          >
            Last updated {new Date(latestUpdate).toLocaleString()}
          </div>
        )}
      </div>

      {/* RiskFormDialog */}
      {dialogState !== null && (
        <RiskFormDialog
          projectId={projectId}
          iterationId={iterationId}
          risk={dialogState === 'create' ? undefined : dialogState}
          onClose={() => setDialogState(null)}
        />
      )}

      {/* SendForApprovalDialog */}
      {approvalOpen && project?.workspace_id && (
        <SendForApprovalDialog
          projectId={projectId}
          iterationId={iterationId}
          workspaceId={project.workspace_id}
          onClose={() => setApprovalOpen(false)}
        />
      )}
    </>
  );
}
