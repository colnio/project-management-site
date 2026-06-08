/**
 * SampleSelectList — reusable checkbox list of a project's samples.
 * Mirrors the picker in NewIterationWizard so experiment create + detail share UI.
 *
 * Generic by intent: the parent decides what a click means.
 *  - Create flow: track a selection Set and toggle membership.
 *  - Detail flow: link immediately on click (pass an empty selectedIds + excludeIds
 *    for already-linked samples so they drop out of the list).
 */
import { useProjectSamples } from '@/hooks/useQueries';
import { LoadingState } from '@/components/LoadingState';
import type { Sample } from '@/api/types';

interface Props {
  projectId: string;
  selectedIds: Set<string>;
  onToggle: (sampleId: string) => void;
  /** Sample ids to hide (e.g. already linked). */
  excludeIds?: string[];
  maxHeight?: number;
}

export function SampleSelectList({ projectId, selectedIds, onToggle, excludeIds, maxHeight = 240 }: Props) {
  const { data: samples = [], isLoading } = useProjectSamples(projectId);
  const exclude = new Set(excludeIds ?? []);
  const visible = samples.filter((s: Sample) => !exclude.has(s.id));

  if (isLoading) return <LoadingState message="Loading samples…" />;
  if (visible.length === 0) {
    return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No samples available in this project.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight, overflowY: 'auto' }}>
      {visible.map((s: Sample) => {
        const sel = selectedIds.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 10px',
              background: sel ? 'var(--ember-tint)' : 'var(--paper-2)',
              border: `1px solid ${sel ? 'var(--ember-soft)' : 'var(--line)'}`,
              borderRadius: 6,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                border: `2px solid ${sel ? 'var(--ember)' : 'var(--line-2)'}`,
                background: sel ? 'var(--ember)' : 'transparent',
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {sel && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink)', fontWeight: 600 }}>
                {s.identifier}
              </span>
              {s.name && (
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>{s.name}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
