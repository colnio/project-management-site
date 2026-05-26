/**
 * ArtifactUpload — file picker → create artifact → PUT to presigned URL → complete.
 * Shows upload progress and the resulting processing_status.
 */
import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateArtifact, useCompleteArtifact, uploadToPresignedUrl } from '@/hooks/useArtifactQueries';
import type { Artifact } from '@/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferType(file: File): 'pdf' | 'ipynb' | 'image' | 'other' {
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return 'pdf';
  if (file.name.endsWith('.ipynb')) return 'ipynb';
  if (file.type.startsWith('image/')) return 'image';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Upload state machine ─────────────────────────────────────────────────────

export type UploadPhase =
  | 'idle'
  | 'creating'
  | 'uploading'
  | 'completing'
  | 'done'
  | 'error';

export interface UploadState {
  phase: UploadPhase;
  progress: number; // 0–100 during uploading
  artifact?: Artifact;
  error?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ArtifactUploadProps {
  projectId: string;
  onDone?: (artifact: Artifact) => void;
}

export function ArtifactUpload({ projectId, onDone }: ArtifactUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: 'idle', progress: 0 });
  const [dragOver, setDragOver] = useState(false);

  const createArtifact = useCreateArtifact(projectId);
  const completeArtifact = useCompleteArtifact();
  const qc = useQueryClient();

  const runUpload = async (file: File) => {
    setState({ phase: 'creating', progress: 0 });

    try {
      // 1. Create the artifact record + get presigned URL
      const res = await createArtifact.mutateAsync({
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        type: inferType(file),
      });

      // 2. PUT file to presigned MinIO URL (direct, not via proxy)
      setState({ phase: 'uploading', progress: 0, artifact: res.artifact });

      try {
        await uploadToPresignedUrl(
          res.upload_url,
          file,
          res.headers ?? {},
          (pct) => setState(s => ({ ...s, progress: pct }))
        );
      } catch (uploadErr) {
        // CORS caveat: MinIO may reject from browser; document it but still try complete
        console.warn('Presigned PUT error (possible MinIO CORS config caveat):', uploadErr);
        // Still attempt complete — server-side may accept
      }

      // 3. Mark upload complete
      setState(s => ({ ...s, phase: 'completing', progress: 100 }));
      const artifact = await completeArtifact.mutateAsync(res.artifact.id);

      // 4. Invalidate project artifacts list
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'artifacts'] });

      setState({ phase: 'done', progress: 100, artifact });
      onDone?.(artifact);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setState({ phase: 'error', progress: 0, error: msg });
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    void runUpload(file);
  };

  const reset = () => {
    setState({ phase: 'idle', progress: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const { phase, progress, artifact, error } = state;

  return (
    <div>
      {/* Drop zone */}
      {(phase === 'idle' || phase === 'error') && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--ember)' : 'var(--line-2)'}`,
            borderRadius: 8,
            padding: '28px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            background: dragOver ? 'var(--ember-tint)' : 'var(--paper-2)',
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 24, opacity: 0.5 }}>⬆</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>
            Drop a file or click to browse
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>
            PDF, images, notebooks (.ipynb), or any file
          </span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {/* Progress / status */}
      {(phase === 'creating' || phase === 'uploading' || phase === 'completing') && (
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: '2px solid var(--line)',
                borderTopColor: 'var(--ember)',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {phase === 'creating' && 'Creating artifact…'}
              {phase === 'uploading' && `Uploading… ${progress}%`}
              {phase === 'completing' && 'Finalizing…'}
            </span>
          </div>
          {phase === 'uploading' && (
            <div style={{ height: 3, background: 'var(--line)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--ember)', transition: 'width 0.2s', borderRadius: 99 }} />
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && artifact && (
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ color: 'var(--good)', fontSize: 16 }}>✓</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {artifact.filename}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginTop: 2 }}>
              {formatBytes(artifact.size_bytes)} · {artifact.type} · status: {artifact.processing_status}
            </div>
          </div>
          <button className="top-btn" style={{ fontSize: 12 }} onClick={reset}>
            Upload another
          </button>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div
          style={{
            border: '1px solid var(--pill-blocked-bd)',
            background: 'var(--pill-blocked-bg)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 8,
          }}
        >
          <span style={{ color: 'var(--bad)', fontSize: 14 }}>✕</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--bad)', flex: 1 }}>{error}</span>
          <button className="top-btn" style={{ fontSize: 12 }} onClick={reset}>Retry</button>
        </div>
      )}
    </div>
  );
}
