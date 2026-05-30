/**
 * Modal to add, edit, and remove project sample tags.
 */
import { useState } from 'react';
import {
  useProjectSampleTags,
  useCreateSampleTag,
  useUpdateSampleTag,
  useDeleteSampleTag,
  type SampleTag,
} from '@/hooks/useQueries';

interface SampleTagsManagerProps {
  projectId: string;
  onClose: () => void;
}

function TagRow({
  tag,
  projectId,
}: {
  tag: SampleTag;
  projectId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(tag.label);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateTag = useUpdateSampleTag(projectId, tag.id);
  const deleteTag = useDeleteSampleTag(projectId);

  const save = async () => {
    setError(null);
    try {
      await updateTag.mutateAsync({ label: label.trim() });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update tag.');
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await deleteTag.mutateAsync(tag.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete tag.');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid var(--line)',
        flexWrap: 'wrap',
      }}
    >
      {editing ? (
        <>
          <input
            className="field-input"
            value={label}
            onChange={e => setLabel(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
            autoFocus
          />
          <button type="button" className="top-btn primary" style={{ fontSize: 12 }} onClick={() => void save()} disabled={updateTag.isPending || !label.trim()}>
            Save
          </button>
          <button type="button" className="top-btn" style={{ fontSize: 12 }} onClick={() => { setEditing(false); setLabel(tag.label); }}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="pill" style={{ fontSize: 12 }}>{tag.label}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button type="button" className="top-btn" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>
              Edit
            </button>
            {confirmDelete ? (
              <>
                <button type="button" className="top-btn" style={{ fontSize: 12, color: 'var(--bad)' }} onClick={() => void remove()} disabled={deleteTag.isPending}>
                  Confirm
                </button>
                <button type="button" className="top-btn" style={{ fontSize: 12 }} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="top-btn" style={{ fontSize: 12, color: 'var(--bad)' }} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <div style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bad)' }}>{error}</div>
      )}
    </div>
  );
}

export function SampleTagsManager({ projectId, onClose }: SampleTagsManagerProps) {
  const { data: tags = [], isLoading, isError } = useProjectSampleTags(projectId);
  const createTag = useCreateSampleTag(projectId);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addTag = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setError(null);
    try {
      await createTag.mutateAsync({ label });
      setNewLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add tag.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <span className="modal-title">Sample tags</span>
          <button type="button" className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
            Define tags for this project. Assign one or more from each sample&apos;s page or when creating a sample.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="field-input"
              placeholder="New tag name"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void addTag(); }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="top-btn primary"
              onClick={() => void addTag()}
              disabled={!newLabel.trim() || createTag.isPending}
            >
              Add
            </button>
          </div>

          {error && (
            <div style={{ marginBottom: 12, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--bad)' }}>{error}</div>
          )}

          {isLoading && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading tags…</div>}
          {isError && <div style={{ fontSize: 13, color: 'var(--bad)' }}>Failed to load tags.</div>}
          {!isLoading && !isError && tags.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No tags yet.</div>
          )}
          {tags.map(tag => (
            <TagRow key={tag.id} tag={tag} projectId={projectId} />
          ))}
        </div>
        <div className="modal-foot">
          <button type="button" className="top-btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
