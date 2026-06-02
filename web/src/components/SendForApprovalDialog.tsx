/**
 * SendForApprovalDialog — lets the user pick stakeholders, write a description,
 * optionally generate an AI review, then submit an approval request.
 *
 * Props: { projectId, iterationId?, workspaceId, onClose }
 *
 * Stakeholder list = dedup union of workspace members + project collaborators,
 * keyed by user_id.
 */
import { useState } from 'react';
import { useWorkspaceMembers, useProjectCollaborators } from '@/hooks/useQueries';
import {
  useGenerateRiskReview,
  useCreateApprovalRequest,
} from '@/hooks/useApprovalQueries';

// ─── Modal primitives (mirrors ShareDialog) ───────────────────────────────────

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
        gap: 18,
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
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

// ─── Person row (checkbox + name + email) ─────────────────────────────────────

interface Person {
  user_id: string;
  display_name: string;
  email: string;
}

function PersonRow({
  person,
  checked,
  onToggle,
}: {
  person: Person;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 0',
        borderBottom: '1px solid var(--line)',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ flexShrink: 0, accentColor: 'var(--ink)' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          {person.display_name || person.email || person.user_id.slice(0, 8) + '…'}
        </span>
        {person.display_name && person.email && (
          <span
            style={{
              marginLeft: 6,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted)',
            }}
          >
            {person.email}
          </span>
        )}
      </div>
    </label>
  );
}

// ─── SendForApprovalDialog ────────────────────────────────────────────────────

interface SendForApprovalDialogProps {
  projectId: string;
  iterationId?: string;
  workspaceId: string;
  onClose: () => void;
}

export function SendForApprovalDialog({
  projectId,
  iterationId,
  workspaceId,
  onClose,
}: SendForApprovalDialogProps) {
  // ── Stakeholder data ──────────────────────────────────────────────────────
  const { data: wsMembers = [] } = useWorkspaceMembers(workspaceId);
  const { data: collabs = [] } = useProjectCollaborators(projectId);

  // Dedup by user_id: prefer workspace members (richer data); supplement with collabs.
  const peopleMap = new Map<string, Person>();
  for (const m of wsMembers) {
    peopleMap.set(m.user_id, {
      user_id: m.user_id,
      display_name: m.display_name ?? '',
      email: m.email ?? '',
    });
  }
  for (const c of collabs) {
    if (!peopleMap.has(c.user_id)) {
      peopleMap.set(c.user_id, {
        user_id: c.user_id,
        display_name: c.display_name ?? '',
        email: c.email ?? '',
      });
    }
  }
  const people = Array.from(peopleMap.values());

  // ── Local state ───────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState('');
  const [aiReview, setAiReview] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const generateReview = useGenerateRiskReview(projectId);
  const createRequest = useCreateApprovalRequest(projectId);

  const handleToggle = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleGenerateReview = () => {
    generateReview.mutate(
      { iteration_id: iterationId },
      {
        onSuccess: ({ review }) => setAiReview(review),
      },
    );
  };

  const handleSend = () => {
    setSubmitError(null);
    createRequest.mutate(
      {
        iteration_id: iterationId,
        description,
        ai_review: aiReview,
        recipient_user_ids: Array.from(selectedIds),
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => setSubmitError(err instanceof Error ? err.message : 'Failed to send'),
      },
    );
  };

  const canSend = selectedIds.size > 0 && !createRequest.isPending;

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
            Send for approval
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

        {/* Stakeholder picker */}
        <div>
          <FieldLabel>Recipients</FieldLabel>
          {people.length === 0 && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11.5,
                color: 'var(--muted-2)',
                padding: '8px 0',
              }}
            >
              No workspace members or collaborators found.
            </div>
          )}
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {people.map(p => (
              <PersonRow
                key={p.user_id}
                person={p}
                checked={selectedIds.has(p.user_id)}
                onToggle={() => handleToggle(p.user_id)}
              />
            ))}
          </div>
          {selectedIds.size > 0 && (
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: 'var(--muted)',
              }}
            >
              {selectedIds.size} recipient{selectedIds.size !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea
            className="field-input"
            rows={3}
            placeholder="Describe what you are requesting approval for…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={createRequest.isPending}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--sans)', fontSize: 13 }}
          />
        </div>

        {/* AI review */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <FieldLabel>LLM Risk Review</FieldLabel>
            <button
              className="top-btn"
              onClick={handleGenerateReview}
              disabled={generateReview.isPending}
              style={{ fontSize: 11.5 }}
            >
              {generateReview.isPending ? 'Generating…' : 'Generate review'}
            </button>
          </div>
          {generateReview.isError && (
            <div
              style={{
                marginBottom: 6,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--bad)',
              }}
            >
              {(generateReview.error as Error).message}
            </div>
          )}
          <textarea
            className="field-input"
            rows={5}
            placeholder='Click "Generate review" to get an LLM-written risk summary, or type your own...'
            value={aiReview}
            onChange={e => setAiReview(e.target.value)}
            disabled={createRequest.isPending}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--sans)', fontSize: 12.5 }}
          />
        </div>

        {/* Submit error */}
        {submitError && (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--bad)',
              marginTop: -8,
            }}
          >
            {submitError}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button className="top-btn" onClick={onClose} disabled={createRequest.isPending}>
            Cancel
          </button>
          <button
            className="top-btn primary"
            onClick={handleSend}
            disabled={!canSend}
          >
            {createRequest.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </DialogCard>
    </Backdrop>
  );
}
