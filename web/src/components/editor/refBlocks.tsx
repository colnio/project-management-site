/**
 * refBlocks.tsx — Custom BlockNote block specs for lab reference embeds.
 *
 * Defines three block types:
 *   sampleRef      — sample identifier + name card
 *   experimentRef  — experiment method + summary card
 *   artifactRef    — artifact filename + type glyph card
 *
 * Each block renders as a styled card embed. Display data is denormalized
 * into props at insert time so no data query is needed inside the editor.
 *
 * Schema is exported and consumed by PageEditorPage.tsx.
 */

import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';

// ─── sampleRef ────────────────────────────────────────────────────────────────

export const sampleRef = createReactBlockSpec(
  {
    type: 'sampleRef' as const,
    propSchema: {
      refId:      { default: '' },
      identifier: { default: '' },
      name:       { default: '' },
      kind:       { default: '' },
      status:     { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block }) => {
      const { refId, identifier, name, kind, status } = block.props;
      const href = refId ? `/samples/${refId}` : '#';
      return (
        <a
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'var(--ref-sample-bg)',
            border: '1px solid var(--ref-sample-bd)',
            borderRadius: 7,
            textDecoration: 'none',
            color: 'inherit',
            fontSize: 13,
            lineHeight: 1.4,
            cursor: 'pointer',
            maxWidth: 480,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'var(--ref-sample-fg)',
              flexShrink: 0,
            }}
          >
            s
          </span>
          {identifier && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--ref-sample-fg)',
                flexShrink: 0,
              }}
            >
              {identifier}
            </span>
          )}
          {name && (
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
          )}
          {kind && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--ref-sample-bd)',
                color: 'var(--ref-sample-fg)',
                fontFamily: 'var(--mono)',
                flexShrink: 0,
              }}
            >
              {kind}
            </span>
          )}
          {status && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 4,
                border: '1px solid var(--ref-sample-bd)',
                color: 'var(--ref-sample-fg)',
                fontFamily: 'var(--mono)',
                flexShrink: 0,
              }}
            >
              {status}
            </span>
          )}
        </a>
      );
    },
  }
);

// ─── experimentRef ────────────────────────────────────────────────────────────

export const experimentRef = createReactBlockSpec(
  {
    type: 'experimentRef' as const,
    propSchema: {
      refId:   { default: '' },
      method:  { default: '' },
      summary: { default: '' },
      status:  { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block }) => {
      const { refId, method, summary, status } = block.props;
      const href = refId ? `/experiments/${refId}` : '#';
      return (
        <a
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'var(--ref-exp-bg)',
            border: '1px solid var(--ref-exp-bd)',
            borderRadius: 7,
            textDecoration: 'none',
            color: 'inherit',
            fontSize: 13,
            lineHeight: 1.4,
            cursor: 'pointer',
            maxWidth: 480,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'var(--ref-exp-fg)',
              flexShrink: 0,
            }}
          >
            e
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ref-exp-fg)',
              flexShrink: 0,
            }}
          >
            {refId ? refId.slice(0, 8) : ''}
          </span>
          {method && (
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {method}
            </span>
          )}
          {summary && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--ref-exp-fg)',
                opacity: 0.75,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 180,
              }}
            >
              {summary}
            </span>
          )}
          {status && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 4,
                border: '1px solid var(--ref-exp-bd)',
                color: 'var(--ref-exp-fg)',
                fontFamily: 'var(--mono)',
                flexShrink: 0,
              }}
            >
              {status}
            </span>
          )}
        </a>
      );
    },
  }
);

// ─── artifactRef ──────────────────────────────────────────────────────────────

export const artifactRef = createReactBlockSpec(
  {
    type: 'artifactRef' as const,
    propSchema: {
      refId:       { default: '' },
      filename:    { default: '' },
      contentType: { default: '' },
      artType:     { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block }) => {
      const { refId, filename, contentType, artType } = block.props;
      const href = refId ? `/artifacts/${refId}` : '#';

      // Derive a glyph from content type
      const glyph = contentType.startsWith('image/')
        ? '🖼'
        : contentType.startsWith('video/')
          ? '▶'
          : contentType === 'application/pdf'
            ? '📄'
            : artType === 'data'
              ? '📊'
              : '📎';

      return (
        <a
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'var(--ref-art-bg)',
            border: '1px solid var(--ref-art-bd)',
            borderRadius: 7,
            textDecoration: 'none',
            color: 'inherit',
            fontSize: 13,
            lineHeight: 1.4,
            cursor: 'pointer',
            maxWidth: 480,
          }}
        >
          <span style={{ fontSize: 15, flexShrink: 0 }}>{glyph}</span>
          {filename && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--ref-art-fg)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {filename}
            </span>
          )}
          {artType && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--ref-art-bd)',
                color: 'var(--ref-art-fg)',
                fontFamily: 'var(--mono)',
                flexShrink: 0,
              }}
            >
              {artType}
            </span>
          )}
        </a>
      );
    },
  }
);

// ─── Schema ───────────────────────────────────────────────────────────────────
// createReactBlockSpec returns a factory function; call it with () to get the spec.

export const refBlockSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    sampleRef:     sampleRef(),
    experimentRef: experimentRef(),
    artifactRef:   artifactRef(),
  },
});

export type RefBlockSchema = typeof refBlockSchema;
