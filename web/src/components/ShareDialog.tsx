/**
 * ShareDialog — project collaborator management modal.
 *
 * Lists current per-project collaborators, allows adding new ones by email,
 * and removing existing ones. Only project owners can add/remove.
 *
 * Props: { projectId: string; onClose: () => void }
 */
import { useState } from 'react';
import {
  useProject,
  useProjectCollaborators,
  useAddCollaborator,
  useRemoveCollaborator,
  useTransferOwnership,
} from '@/hooks/useQueries';
import type { Collaborator } from '@/hooks/useQueries';
import { useResolvedProjectRole } from '@/hooks/useProjectAccess';

// ─── Modal primitives (mirrors NewIterationWizard) ────────────────────────────

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
          maxWidth: 520,
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

// ─── Field label helper ───────────────────────────────────────────────────────

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

// ─── Collaborator row ─────────────────────────────────────────────────────────

function CollaboratorRow({
  collab,
  projectId,
  canManage,
}: {
  collab: Collaborator;
  projectId: string;
  canManage: boolean;
}) {
  const remove = useRemoveCollaborator(projectId);
  const [confirm, setConfirm] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {/* User identity */}
      <div
        style={{
          flex: 1,
          fontSize: 12,
          color: 'var(--ink)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={collab.email || collab.user_id}
      >
        {collab.display_name || collab.email || `${collab.user_id.slice(0, 8)}…`}
        {collab.display_name && collab.email && (
          <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>
            {collab.email}
          </span>
        )}
      </div>

      {/* Role badge */}
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--muted)',
          background: 'var(--paper-2)',
          border: '1px solid var(--line)',
          borderRadius: 4,
          padding: '1px 6px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        {collab.role}
      </span>

      {/* Remove — owners only (matches POST/DELETE /collaborators) */}
      {canManage && (
        confirm ? (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              className="top-btn"
              style={{ fontSize: 10.5, color: 'var(--bad)', padding: '2px 8px' }}
              onClick={() => { remove.mutate(collab.user_id); setConfirm(false); }}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Removing…' : 'Confirm'}
            </button>
            <button
              className="top-btn"
              style={{ fontSize: 10.5, padding: '2px 8px' }}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="icon-btn"
            style={{ fontSize: 10, color: 'var(--muted-2)', padding: '2px 4px', flexShrink: 0 }}
            onClick={() => setConfirm(true)}
            title="Remove collaborator"
            disabled={remove.isPending}
          >
            ✕
          </button>
        )
      )}

      {/* Inline remove error */}
      {remove.isError && (
        <div
          style={{
            width: '100%',
            marginTop: 2,
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--bad)',
          }}
        >
          {(remove.error as Error).message}
        </div>
      )}
    </div>
  );
}

// ─── Transfer ownership ───────────────────────────────────────────────────────

function TransferOwnershipSection({
  projectId,
  ownerId,
  collaborators,
}: {
  projectId: string;
  ownerId: string | undefined;
  collaborators: Collaborator[];
}) {
  const transfer = useTransferOwnership(projectId);
  const [target, setTarget] = useState('');
  const [confirm, setConfirm] = useState(false);

  // Candidates: collaborators who aren't already the owner.
  const candidates = collaborators.filter(c => c.user_id !== ownerId);
  const ownerCollab = collaborators.find(c => c.user_id === ownerId);
  const ownerLabel = ownerCollab
    ? (ownerCollab.display_name || ownerCollab.email || `${ownerId?.slice(0, 8)}…`)
    : ownerId
      ? `${ownerId.slice(0, 8)}…`
      : 'unknown';

  const doTransfer = () => {
    if (!target) return;
    transfer.mutate(target, {
      onSuccess: () => { setTarget(''); setConfirm(false); },
    });
  };

  return (
    <div>
      <FieldLabel>Ownership</FieldLabel>
      <div style={{ fontSize: 12, color: 'var(--ink)', padding: '4px 0 10px' }}>
        Current owner:{' '}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{ownerLabel}</span>
      </div>
      {candidates.length === 0 ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
          Add a collaborator below, then transfer ownership to them.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={target}
            onChange={e => { setTarget(e.target.value); setConfirm(false); }}
            disabled={transfer.isPending}
            style={{
              flex: 1,
              fontFamily: 'var(--mono)',
              fontSize: 12,
              background: 'var(--paper-2)',
              border: '1px solid var(--line)',
              borderRadius: 5,
              color: 'var(--ink)',
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            <option value="">Transfer to…</option>
            {candidates.map(c => (
              <option key={c.user_id} value={c.user_id}>
                {c.display_name || c.email || `${c.user_id.slice(0, 8)}…`}
              </option>
            ))}
          </select>
          {confirm ? (
            <>
              <button
                className="top-btn"
                style={{ fontSize: 11, color: 'var(--bad)', flexShrink: 0 }}
                onClick={doTransfer}
                disabled={transfer.isPending}
              >
                {transfer.isPending ? 'Transferring…' : 'Confirm transfer'}
              </button>
              <button
                className="top-btn"
                style={{ fontSize: 11, flexShrink: 0 }}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="top-btn"
              style={{ flexShrink: 0 }}
              onClick={() => setConfirm(true)}
              disabled={!target || transfer.isPending}
            >
              Transfer
            </button>
          )}
        </div>
      )}
      {transfer.isError && (
        <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bad)' }}>
          {(transfer.error as Error).message}
        </div>
      )}
    </div>
  );
}

// ─── ShareDialog ──────────────────────────────────────────────────────────────

interface ShareDialogProps {
  projectId: string;
  onClose: () => void;
}

export function ShareDialog({ projectId, onClose }: ShareDialogProps) {
  const { data: collaborators = [], isLoading, isError } = useProjectCollaborators(projectId);
  const { data: project } = useProject(projectId);
  const { canManageCollaborators } = useResolvedProjectRole(projectId);
  const add = useAddCollaborator(projectId);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'editor' | 'viewer'>('editor');

  const handleAdd = () => {
    if (!email.trim()) return;
    add.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => {
          setEmail('');
          setRole('editor');
        },
      }
    );
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
            Share project
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

        {/* Current collaborators */}
        <div>
          <FieldLabel>Collaborators</FieldLabel>
          {isLoading && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 12,
                color: 'var(--muted)',
                padding: '8px 0',
              }}
            >
              Loading…
            </div>
          )}
          {isError && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--bad)',
                padding: '6px 0',
              }}
            >
              Failed to load collaborators.
            </div>
          )}
          {!isLoading && !isError && collaborators.length === 0 && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11.5,
                color: 'var(--muted-2)',
                padding: '8px 0',
              }}
            >
              No per-project collaborators. Workspace members have their workspace-level access.
            </div>
          )}
          {collaborators.map(c => (
            <CollaboratorRow
              key={c.id}
              collab={c}
              projectId={projectId}
              canManage={canManageCollaborators}
            />
          ))}
        </div>

        {/* Transfer ownership — owners only */}
        {canManageCollaborators && (
          <TransferOwnershipSection
            projectId={projectId}
            ownerId={project?.owner_id}
            collaborators={collaborators}
          />
        )}

        {/* Add collaborator — owners only */}
        {canManageCollaborators && (
        <div>
          <FieldLabel>Add collaborator</FieldLabel>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="field-input"
              style={{ flex: 1 }}
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              disabled={add.isPending}
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value as 'owner' | 'editor' | 'viewer')}
              disabled={add.isPending}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 12,
                background: 'var(--paper-2)',
                border: '1px solid var(--line)',
                borderRadius: 5,
                color: 'var(--ink)',
                padding: '5px 8px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="owner">owner</option>
            </select>
            <button
              className="top-btn primary"
              onClick={handleAdd}
              disabled={!email.trim() || add.isPending}
              style={{ flexShrink: 0 }}
            >
              {add.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>

          {/* Inline add error */}
          {add.isError && (
            <div
              style={{
                marginTop: 8,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--bad)',
              }}
            >
              {(add.error as Error).message}
            </div>
          )}
        </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
          <button className="top-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </DialogCard>
    </Backdrop>
  );
}
