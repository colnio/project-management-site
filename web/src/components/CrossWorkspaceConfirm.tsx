/**
 * CrossWorkspaceConfirm — reusable confirmation dialog for inserting an entity
 * that originates from a different workspace.
 *
 * Uses the Backdrop + DialogCard pattern from TaskActionDialogs / RiskFormDialog.
 */

import React from 'react';

// ─── Modal primitives (mirrors TaskActionDialogs) ─────────────────────────────

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.30)',
          zIndex: 510,
          backdropFilter: 'blur(3px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 511,
          width: '100%',
          maxWidth: 440,
          padding: '0 16px',
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

// ─── CrossWorkspaceConfirm ────────────────────────────────────────────────────

export interface CrossWorkspaceConfirmProps {
  open: boolean;
  entityType: string;
  entityLabel: string;
  workspaceName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CrossWorkspaceConfirm({
  open,
  entityType,
  entityLabel,
  workspaceName,
  onConfirm,
  onCancel,
}: CrossWorkspaceConfirmProps) {
  if (!open) return null;

  return (
    <Backdrop onClose={onCancel}>
      <DialogCard>
        {/* Title */}
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 17,
            fontWeight: 400,
            color: 'var(--ink)',
          }}
        >
          Cross-workspace reference
        </div>

        {/* Body */}
        <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6 }}>
          This{' '}
          <strong style={{ fontWeight: 600 }}>{entityType}</strong>{' '}
          (<span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{entityLabel}</span>){' '}
          is from another workspace{' '}
          (<span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{workspaceName}</span>).
          Continue?
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '7px 16px',
              border: '1px solid var(--line-2)',
              borderRadius: 7,
              background: 'var(--paper-2)',
              color: 'var(--ink)',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '7px 16px',
              border: '1px solid var(--ember-soft)',
              borderRadius: 7,
              background: 'var(--ember)',
              color: '#fff',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
              fontWeight: 500,
            }}
          >
            Continue
          </button>
        </div>
      </DialogCard>
    </Backdrop>
  );
}
