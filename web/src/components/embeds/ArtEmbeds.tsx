/**
 * ArtEmbeds — presentational components that render an Artifact richly.
 *
 * ArtImage   — figure with image, caption, optional magnification + scale-bar row
 * ArtPDF     — preview card: thumbnail/PDF glyph, filename, size, open affordance
 * ArtNotebook — card with notebook-cell aesthetic, derived from artifact.metadata
 * ArtEmbed   — dispatcher that routes to the correct component by artifact.type
 */
import { useState } from 'react';
import { ArtifactDetailModal } from '@/components/ArtifactViewer';
import type { Artifact } from '@/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Safe cast of artifact.metadata to a string-keyed object. */
function metaRecord(artifact: Artifact): Record<string, unknown> {
  if (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)) {
    return artifact.metadata as Record<string, unknown>;
  }
  return {};
}

// ─── ArtImage ─────────────────────────────────────────────────────────────────

export interface ArtImageProps {
  artifact: Artifact;
  caption?: string;
  /** e.g. "5000x" — shown in annotation row */
  magnification?: string;
  /** e.g. "1 µm" — shown in annotation row */
  scaleBar?: string;
}

export function ArtImage({ artifact, caption, magnification, scaleBar }: ArtImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Prefer the full-resolution original for browser-renderable image formats
  // (matches the Artifacts tab viewer). Non-web formats the browser can't
  // display inline (e.g. TIFF) fall back to the worker-generated thumbnail.
  const webImage = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/i.test(artifact.content_type ?? '');
  const src =
    (webImage ? artifact.original_url : '') ||
    artifact.rendered_url ||
    artifact.thumbnail_url ||
    artifact.original_url ||
    null;
  const meta = metaRecord(artifact);

  // Fall back to metadata fields if props not supplied
  const mag = magnification ?? (typeof meta.magnification === 'string' || typeof meta.magnification === 'number' ? String(meta.magnification) : null);
  const scale = scaleBar ?? (typeof meta.scale_bar === 'string' || typeof meta.scale_bar === 'number' ? String(meta.scale_bar) : null);
  const cap = caption ?? (typeof meta.caption === 'string' ? meta.caption : artifact.filename);

  const hasAnnotations = mag || scale;

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Image frame */}
      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--paper-2)',
          position: 'relative',
          cursor: src ? 'zoom-in' : 'default',
        }}
        onClick={() => src && setLightboxOpen(true)}
      >
        {src ? (
          <img
            src={src}
            alt={artifact.filename}
            style={{ display: 'block', width: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              height: 160,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted-2)',
            }}
          >
            No preview
          </div>
        )}

        {/* Type badge */}
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            color: 'var(--muted)',
            background: 'rgba(250,249,246,0.88)',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid var(--line)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
          }}
        >
          {artifact.type}
        </span>
      </div>

      {/* Annotation row */}
      {hasAnnotations && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted)',
          }}
        >
          {mag && <span>mag: {mag}</span>}
          {scale && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 18,
                  height: 2,
                  background: 'var(--muted)',
                  borderRadius: 1,
                  verticalAlign: 'middle',
                }}
              />
              {scale}
            </span>
          )}
        </div>
      )}

      {/* Caption */}
      {cap && (
        <figcaption
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontStyle: 'italic',
            lineHeight: 1.4,
          }}
        >
          {cap}
        </figcaption>
      )}

      {/* Lightbox */}
      {lightboxOpen && src && (
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
              src={src}
              alt={artifact.filename}
              style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, display: 'block' }}
            />
          </div>
        </div>
      )}
    </figure>
  );
}

// ─── ArtPDF ───────────────────────────────────────────────────────────────────

export interface ArtPDFProps {
  artifact: Artifact;
}

export function ArtPDF({ artifact }: ArtPDFProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const thumb = artifact.thumbnail_url || null;

  const openUrl = artifact.rendered_url || artifact.original_url || null;

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Thumbnail / PDF glyph header */}
      <div
        style={{
          height: 120,
          background: 'var(--paper-2)',
          borderBottom: '1px solid var(--line)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={artifact.filename}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              color: 'var(--muted-2)',
            }}
          >
            {/* Faux PDF glyph */}
            <svg width="36" height="44" viewBox="0 0 36 44" fill="none" aria-hidden>
              <rect x="1" y="1" width="34" height="42" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M22 1v10h12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <text x="18" y="34" textAnchor="middle" fontFamily="var(--mono)" fontSize="10" fill="currentColor" fontWeight="600">PDF</text>
            </svg>
          </div>
        )}
        {/* Type badge */}
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            color: 'var(--muted)',
            background: 'rgba(250,249,246,0.88)',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid var(--line)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
          }}
        >
          PDF
        </span>
      </div>

      {/* Info row */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={artifact.filename}
        >
          {artifact.filename}
        </div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted)',
            display: 'flex',
            gap: 10,
          }}
        >
          <span>{formatBytes(artifact.size_bytes)}</span>
          <span style={{ color: 'var(--line-2)' }}>·</span>
          <span>{artifact.processing_status}</span>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '0 12px 10px',
          display: 'flex',
          gap: 6,
        }}
      >
        <button
          className="top-btn primary"
          style={{ fontSize: 11, padding: '3px 9px' }}
          onClick={() => setModalOpen(true)}
        >
          View
        </button>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="top-btn"
            style={{ fontSize: 11, padding: '3px 9px', textDecoration: 'none' }}
          >
            Open
          </a>
        )}
      </div>

      {modalOpen && (
        <ArtifactDetailModal artifact={artifact} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

// ─── ArtNotebook ─────────────────────────────────────────────────────────────

export interface ArtNotebookProps {
  artifact: Artifact;
}

/** Derive faux cell previews from artifact metadata or fall back to placeholders. */
function NotebookCellPreviews({ artifact }: { artifact: Artifact }) {
  const meta = metaRecord(artifact);

  // Attempt to get cell info from metadata
  const cellCount =
    typeof meta.cell_count === 'number' ? meta.cell_count :
    typeof meta.cells === 'number' ? meta.cells :
    null;

  const previewText =
    typeof meta.preview === 'string' ? meta.preview :
    typeof meta.description === 'string' ? meta.description :
    null;

  // Two faux rows: code input + output
  const rows: { kind: 'code' | 'out'; text: string }[] = [];

  if (previewText) {
    rows.push({ kind: 'code', text: previewText.slice(0, 80) + (previewText.length > 80 ? '…' : '') });
  } else {
    rows.push({ kind: 'code', text: `# ${artifact.filename.replace(/\.ipynb$/, '')}` });
    rows.push({ kind: 'code', text: 'import numpy as np, pandas as pd' });
  }

  if (cellCount !== null) {
    rows.push({ kind: 'out', text: `${cellCount} cells` });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '4px 10px',
            background: row.kind === 'code' ? 'var(--paper-2)' : 'var(--surface)',
            borderLeft: `2px solid ${row.kind === 'code' ? 'var(--ember-soft)' : 'var(--line-2)'}`,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              color: 'var(--muted-2)',
              paddingTop: 2,
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {row.kind === 'code' ? 'In' : 'Out'}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: row.kind === 'code' ? 'var(--ink)' : 'var(--muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.text}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ArtNotebook({ artifact }: ArtNotebookProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const hasRendered = artifact.processing_status === 'done' && !!artifact.rendered_url;

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar — notebook aesthetic */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* Faux traffic-light dots */}
        {['var(--bad)', 'var(--warn)', 'var(--good)'].map((c, i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: c,
              opacity: 0.5,
              flexShrink: 0,
            }}
          />
        ))}
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {artifact.filename}
        </span>
        {!hasRendered && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: 'var(--warn)',
              background: 'var(--paper-2)',
              padding: '1px 5px',
              borderRadius: 3,
              border: '1px solid var(--line)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            {artifact.processing_status}
          </span>
        )}
      </div>

      {/* Cell previews */}
      <div style={{ padding: '8px 0' }}>
        <NotebookCellPreviews artifact={artifact} />
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--muted-2)',
            flex: 1,
          }}
        >
          {formatBytes(artifact.size_bytes)}
        </span>
        <button
          className="top-btn primary"
          style={{ fontSize: 11, padding: '3px 9px' }}
          onClick={() => setModalOpen(true)}
        >
          Open
        </button>
        {artifact.rendered_url && (
          <a
            href={artifact.rendered_url}
            target="_blank"
            rel="noopener noreferrer"
            className="top-btn"
            style={{ fontSize: 11, padding: '3px 9px', textDecoration: 'none' }}
          >
            Rendered
          </a>
        )}
      </div>

      {modalOpen && (
        <ArtifactDetailModal artifact={artifact} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

// ─── ArtHTML ──────────────────────────────────────────────────────────────────

export interface ArtHTMLProps {
  artifact: Artifact;
}

export function ArtHTML({ artifact }: ArtHTMLProps) {
  const src = artifact.rendered_url || artifact.original_url || null;
  const openUrl = src;

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--paper-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            color: 'var(--muted)',
            background: 'rgba(250,249,246,0.88)',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid var(--line)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
            flexShrink: 0,
          }}
        >
          HTML
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {artifact.filename}
        </span>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--ember)',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Open in new tab ↗
          </a>
        )}
      </div>

      {/* Sandboxed iframe — no allow-same-origin to prevent sandbox escape */}
      {src ? (
        <iframe
          src={src}
          sandbox="allow-scripts"
          style={{
            width: '100%',
            height: 400,
            border: 'none',
            display: 'block',
            background: 'var(--paper)',
          }}
          title={artifact.filename}
        />
      ) : (
        <div
          style={{
            height: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted-2)',
          }}
        >
          {artifact.processing_status === 'pending' || artifact.processing_status === 'processing'
            ? 'Processing…'
            : 'No preview available'}
        </div>
      )}

      {/* Info row */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)', flex: 1 }}>
          {formatBytes(artifact.size_bytes)}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)' }}>
          {artifact.processing_status}
        </span>
      </div>
    </div>
  );
}

// ─── ArtEmbed dispatcher ──────────────────────────────────────────────────────

export interface ArtEmbedProps {
  artifact: Artifact;
  /** Override image display props */
  imageProps?: Omit<ArtImageProps, 'artifact'>;
}

export function ArtEmbed({ artifact, imageProps }: ArtEmbedProps) {
  if (artifact.type === 'image') {
    return <ArtImage artifact={artifact} {...imageProps} />;
  }
  if (artifact.type === 'pdf') {
    return <ArtPDF artifact={artifact} />;
  }
  if (artifact.type === 'ipynb') {
    return <ArtNotebook artifact={artifact} />;
  }
  // 'other' with text/html content_type → sandboxed HTML viewer
  if (artifact.content_type === 'text/html') {
    return <ArtHTML artifact={artifact} />;
  }
  // 'other' — fall back to PDF card layout (download affordance)
  return <ArtPDF artifact={artifact} />;
}
