/**
 * RiskFormDialog — create or edit a risk.
 *
 * Create mode: title (req), likelihood, impact_headline, impact_description,
 *              mitigation, plan_b.
 * Edit mode:   all create fields + status (open/mitigated/accepted/closed).
 *
 * Props:
 *   projectId   — always required
 *   iterationId — when set and in create mode, sets iteration_id on the new risk
 *   risk        — when provided, switches to edit mode and pre-fills fields
 *   onClose     — called when the dialog should close
 */
import { useState, useEffect } from 'react';
import {
  useCreateRisk,
  useUpdateRisk,
  type Risk,
} from '@/hooks/useRiskQueries';

// ─── Modal primitives (mirrors ShareDialog / EditProjectDialog) ───────────────

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.30)',
          zIndex: 200,
          backdropFilter: 'blur(3px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: '100%',
          maxWidth: 560,
          padding: '0 16px',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </>
  );
}

function DialogCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-2)',
        borderRadius: 12,
        padding: '24px 28px 22px',
        boxShadow: '0 24px 72px rgba(20,18,14,0.22)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        color: 'var(--muted-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

// ─── Shared select style ──────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  background: 'var(--paper-2)',
  border: '1px solid var(--line)',
  borderRadius: 5,
  color: 'var(--ink)',
  padding: '6px 10px',
  cursor: 'pointer',
  width: '100%',
};

// ─── RiskFormDialog ───────────────────────────────────────────────────────────

interface RiskFormDialogProps {
  projectId: string;
  iterationId?: string;
  /** When provided the dialog is in edit mode. */
  risk?: Risk;
  onClose: () => void;
}

export function RiskFormDialog({ projectId, iterationId, risk, onClose }: RiskFormDialogProps) {
  const isEdit = !!risk;

  // ── form state ──────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [likelihood, setLikelihood] = useState<'high' | 'med' | 'low'>('low');
  const [impactHeadline, setImpactHeadline] = useState('');
  const [impactDescription, setImpactDescription] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [planB, setPlanB] = useState('');
  const [status, setStatus] = useState<'open' | 'mitigated' | 'accepted' | 'closed'>('open');

  // Pre-fill in edit mode
  useEffect(() => {
    if (risk) {
      setTitle(risk.title);
      setLikelihood(risk.likelihood);
      setImpactHeadline(risk.impact_headline ?? '');
      setImpactDescription(risk.impact_description ?? '');
      setMitigation(risk.mitigation ?? '');
      setPlanB(risk.plan_b ?? '');
      setStatus(risk.status);
    }
  }, [risk]);

  // ── mutations ───────────────────────────────────────────────────────────────
  const create = useCreateRisk(projectId);
  const update = useUpdateRisk(risk?.id ?? '', projectId);

  const isPending = isEdit ? update.isPending : create.isPending;
  const mutationError = isEdit
    ? (update.isError ? (update.error as Error).message : null)
    : (create.isError ? (create.error as Error).message : null);

  // ── submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!title.trim()) return;

    if (isEdit) {
      update.mutate(
        {
          title: title.trim(),
          likelihood,
          impact_headline: impactHeadline,
          impact_description: impactDescription,
          mitigation,
          plan_b: planB,
          status,
        },
        { onSuccess: onClose }
      );
    } else {
      create.mutate(
        {
          title: title.trim(),
          likelihood,
          impact_headline: impactHeadline,
          impact_description: impactDescription,
          mitigation,
          plan_b: planB,
          ...(iterationId ? { iteration_id: iterationId } : {}),
        },
        { onSuccess: onClose }
      );
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <DialogCard>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            {isEdit ? 'Edit risk' : 'Add risk'}
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            style={{ fontSize: 14 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Title */}
        <div>
          <FieldLabel>Title *</FieldLabel>
          <input
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Describe the risk"
            autoFocus
            disabled={isPending}
          />
        </div>

        {/* Likelihood */}
        <div>
          <FieldLabel>Likelihood</FieldLabel>
          <select
            style={selectStyle}
            value={likelihood}
            onChange={e => setLikelihood(e.target.value as 'high' | 'med' | 'low')}
            disabled={isPending}
          >
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Impact headline */}
        <div>
          <FieldLabel>Impact headline</FieldLabel>
          <input
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={impactHeadline}
            onChange={e => setImpactHeadline(e.target.value)}
            placeholder="Short impact summary"
            disabled={isPending}
          />
        </div>

        {/* Impact description */}
        <div>
          <FieldLabel>Impact description</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical' }}
            value={impactDescription}
            onChange={e => setImpactDescription(e.target.value)}
            placeholder="Detailed description of the impact"
            disabled={isPending}
          />
        </div>

        {/* Mitigation */}
        <div>
          <FieldLabel>Mitigation</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical' }}
            value={mitigation}
            onChange={e => setMitigation(e.target.value)}
            placeholder="How will this risk be mitigated?"
            disabled={isPending}
          />
        </div>

        {/* Plan B */}
        <div>
          <FieldLabel>Plan B</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, resize: 'vertical' }}
            value={planB}
            onChange={e => setPlanB(e.target.value)}
            placeholder="Fallback plan if mitigation fails"
            disabled={isPending}
          />
        </div>

        {/* Status — edit mode only */}
        {isEdit && (
          <div>
            <FieldLabel>Status</FieldLabel>
            <select
              style={selectStyle}
              value={status}
              onChange={e => setStatus(e.target.value as 'open' | 'mitigated' | 'accepted' | 'closed')}
              disabled={isPending}
            >
              <option value="open">Open</option>
              <option value="mitigated">Mitigated</option>
              <option value="accepted">Accepted</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        )}

        {/* Inline error */}
        {mutationError && (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--bad)',
            }}
          >
            {mutationError}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button className="top-btn" onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button
            className="top-btn primary"
            onClick={handleSubmit}
            disabled={!title.trim() || isPending}
          >
            {isPending ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save changes' : 'Add risk')}
          </button>
        </div>
      </DialogCard>
    </Backdrop>
  );
}
