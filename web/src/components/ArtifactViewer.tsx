/**
 * ArtifactViewer — renders an artifact based on its type:
 *   pdf    → pdfjs-dist first-page canvas
 *   image  → img with lightbox (click to enlarge)
 *   ipynb  → sandboxed iframe of rendered_url (or "processing" placeholder)
 *   other  → download link
 */
import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { Artifact } from '@/api/types';

// Configure PDF.js worker once (bundled URL)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ─── PDF Viewer ────────────────────────────────────────────────────────────────

function PdfViewer({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    let cancelled = false;

    const render = async () => {
      try {
        const doc = await pdfjs.getDocument(url).promise;
        if (cancelled) return;
        const page = await doc.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale: 1.0 });
        const container = canvas.parentElement;
        const containerWidth = container?.clientWidth ?? 300;
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas }).promise;
      } catch (e) {
        if (!cancelled) {
          setError('Could not load PDF preview.');
          console.error(e);
        }
      }
    };

    void render();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return (
      <div style={{ padding: '20px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--bad)' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
    </div>
  );
}

// ─── Image Viewer (with lightbox) ─────────────────────────────────────────────

function ImageViewer({ url, filename }: { url: string; filename: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <img
        src={url}
        alt={filename}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          cursor: 'zoom-in',
          display: 'block',
        }}
        onClick={() => setLightboxOpen(true)}
      />
      {lightboxOpen && (
        <div
          className="modal-overlay"
          style={{ zIndex: 200 }}
          onClick={() => setLightboxOpen(false)}
        >
          <div
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              className="icon-btn"
              style={{
                position: 'absolute',
                top: -32,
                right: 0,
                color: 'var(--paper)',
                background: 'rgba(0,0,0,0.4)',
                borderRadius: 6,
              }}
              onClick={() => setLightboxOpen(false)}
            >
              ✕
            </button>
            <img
              src={url}
              alt={filename}
              style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, display: 'block' }}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Notebook Viewer ──────────────────────────────────────────────────────────

function NotebookViewer({ artifact }: { artifact: Artifact }) {
  if (artifact.processing_status !== 'done' || !artifact.rendered_url) {
    const statusLabel = artifact.processing_status === 'failed'
      ? 'Rendering failed'
      : artifact.processing_status === 'processing'
        ? 'Processing notebook…'
        : 'Notebook processing pending…';

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          flexDirection: 'column',
          gap: 8,
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        {artifact.processing_status === 'processing' && (
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: '2px solid var(--line)',
              borderTopColor: 'var(--ember)',
              animation: 'spin 0.8s linear infinite',
              display: 'inline-block',
            }}
          />
        )}
        {statusLabel}
      </div>
    );
  }

  return (
    <iframe
      src={artifact.rendered_url}
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', border: 'none' }}
      title={artifact.filename}
    />
  );
}

// ─── Generic download ─────────────────────────────────────────────────────────

function GenericViewer({ artifact }: { artifact: Artifact }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 10,
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: 'var(--muted)',
      }}
    >
      <span style={{ fontSize: 28, opacity: 0.4 }}>⬇</span>
      <span>{artifact.filename}</span>
      {artifact.original_url && (
        <a
          href={artifact.original_url}
          download={artifact.filename}
          className="top-btn primary"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          Download
        </a>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function ProcessingBadge({ status }: { status: string }) {
  const color: Record<string, string> = {
    pending: 'var(--warn)',
    processing: 'var(--info)',
    done: 'var(--good)',
    failed: 'var(--bad)',
  };
  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 9.5,
        color: color[status] ?? 'var(--muted)',
        background: 'var(--surface)',
        padding: '1px 5px',
        borderRadius: 3,
        border: '1px solid var(--line)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  );
}

// ─── Thumbnail area ───────────────────────────────────────────────────────────

interface ThumbnailProps {
  artifact: Artifact;
  /** expand=true shows a larger detail view */
  expand?: boolean;
}

export function ArtifactThumbnail({ artifact, expand = false }: ThumbnailProps) {
  const type = artifact.type;

  const containerStyle: React.CSSProperties = expand
    ? { width: '100%', height: 340, overflow: 'hidden', background: 'var(--paper-2)', borderRadius: 8, border: '1px solid var(--line)' }
    : { width: '100%', aspectRatio: '4/3', overflow: 'hidden', background: 'var(--paper-2)', position: 'relative' };

  const typeLabel = (artifact.content_type?.split('/')[1] ?? artifact.type ?? 'file').toUpperCase();

  // Image: use thumbnail_url for card, original for expand
  if (type === 'image') {
    const src = expand
      ? (artifact.original_url || artifact.thumbnail_url)
      : (artifact.thumbnail_url || artifact.original_url);
    if (src) {
      return (
        <div style={containerStyle}>
          <ImageViewer url={src} filename={artifact.filename} />
        </div>
      );
    }
  }

  // PDF: always render canvas
  if (type === 'pdf' && artifact.original_url) {
    return (
      <div style={{ ...containerStyle, padding: expand ? 0 : 0 }}>
        <PdfViewer url={artifact.original_url} />
      </div>
    );
  }

  // Notebook
  if (type === 'ipynb') {
    return (
      <div style={containerStyle}>
        <NotebookViewer artifact={artifact} />
      </div>
    );
  }

  // Other / fallback
  return (
    <div style={{ ...containerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      {!expand && <div className="ph-stripes" style={{ position: 'absolute', inset: 0 }} />}
      {!expand && (
        <span
          style={{
            position: 'relative',
            zIndex: 1,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted-2)',
          }}
        >
          {typeLabel}
        </span>
      )}
      {expand && <GenericViewer artifact={artifact} />}
    </div>
  );
}

// ─── Artifact Detail Modal ────────────────────────────────────────────────────

interface ArtifactDetailModalProps {
  artifact: Artifact;
  onClose: () => void;
}

export function ArtifactDetailModal({ artifact, onClose }: ArtifactDetailModalProps) {
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 150 }} onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 720, width: '90vw' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-title">{artifact.filename}</span>
          <ProcessingBadge status={artifact.processing_status} />
          <button className="icon-btn" style={{ marginLeft: 8 }} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          {/* Viewer */}
          <div style={{ borderBottom: '1px solid var(--line)' }}>
            <ArtifactThumbnail artifact={artifact} expand />
          </div>

          {/* Meta */}
          <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
            {[
              { label: 'Type', value: artifact.type },
              { label: 'Content-Type', value: artifact.content_type },
              { label: 'Size', value: formatBytes(artifact.size_bytes) },
              { label: 'Uploaded', value: new Date(artifact.uploaded_at).toLocaleString() },
              { label: 'Status', value: artifact.processing_status },
              { label: 'ID', value: artifact.id.slice(0, 16) + '…' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 90, flexShrink: 0, paddingTop: 1 }}>{r.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          {artifact.original_url && (
            <a
              href={artifact.original_url}
              download={artifact.filename}
              className="top-btn"
              style={{ textDecoration: 'none' }}
            >
              Download
            </a>
          )}
          <button className="top-btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
