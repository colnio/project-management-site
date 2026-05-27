/**
 * EditProjectDialog — edit project name, description, and visibility.
 *
 * Pre-fills fields from the loaded project and saves via useUpdateProject.
 * Matches ShareDialog's modal look (Backdrop + DialogCard primitives).
 *
 * Props: { projectId: string; onClose: () => void }
 */
import { useState, useEffect } from 'react';
import { useProject, useUpdateProject } from '@/hooks/useQueries';

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

// ─── EditProjectDialog ────────────────────────────────────────────────────────

interface EditProjectDialogProps {
  projectId: string;
  onClose: () => void;
}

export function EditProjectDialog({ projectId, onClose }: EditProjectDialogProps) {
  const { data: project } = useProject(projectId);
  const update = useUpdateProject(projectId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'workspace' | 'private'>('workspace');

  // Pre-fill once project loads
  useEffect(() => {
    if (project) {
      setName(project.name ?? '');
      setDescription(project.description ?? '');
      setVisibility((project.visibility as 'workspace' | 'private') ?? 'workspace');
    }
  }, [project]);

  const handleSave = async () => {
    if (!name.trim()) return;
    await update.mutateAsync({ name: name.trim(), description, visibility });
    onClose();
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
            Edit project details
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

        {/* Name */}
        <div>
          <FieldLabel>Name</FieldLabel>
          <input
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Project name"
            autoFocus
            disabled={update.isPending}
          />
        </div>

        {/* Description */}
        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical' }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional project description"
            disabled={update.isPending}
          />
        </div>

        {/* Visibility */}
        <div>
          <FieldLabel>Visibility</FieldLabel>
          <select
            value={visibility}
            onChange={e => setVisibility(e.target.value as 'workspace' | 'private')}
            disabled={update.isPending}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              background: 'var(--paper-2)',
              border: '1px solid var(--line)',
              borderRadius: 5,
              color: 'var(--ink)',
              padding: '6px 10px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <option value="workspace">Workspace — all workspace members can read</option>
            <option value="private">Private — only invited collaborators</option>
          </select>
        </div>

        {/* Inline error */}
        {update.isError && (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--bad)',
            }}
          >
            {(update.error as Error).message}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button className="top-btn" onClick={onClose} disabled={update.isPending}>
            Cancel
          </button>
          <button
            className="top-btn primary"
            onClick={() => { void handleSave(); }}
            disabled={!name.trim() || update.isPending}
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </DialogCard>
    </Backdrop>
  );
}
