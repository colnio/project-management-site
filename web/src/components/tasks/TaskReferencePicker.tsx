/**
 * TaskReferencePicker — checkbox lists for Samples, Experiments, Pages.
 * Mirrors the SamplesPickerStep checkbox pattern from NewIterationWizard.tsx.
 */
import { useTaskReferences, useAddReference, useRemoveReference } from '@/hooks/useTaskQueries';
import { useProjectSamples, useProjectExperiments } from '@/hooks/useQueries';
import { useProjectPages } from '@/hooks/usePageQueries';
import type { Sample, Experiment } from '@/api/types';
import type { PageListItem } from '@/hooks/usePageQueries';

// ─── Checkbox row ─────────────────────────────────────────────────────────────

function CheckRow({
  label,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        background: checked ? 'var(--ember-tint)' : 'var(--paper-2)',
        border: `1px solid ${checked ? 'var(--ember-soft)' : 'var(--line)'}`,
        borderRadius: 6,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        width: '100%',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `2px solid ${checked ? 'var(--ember)' : 'var(--line-2)'}`,
          background: checked ? 'var(--ember)' : 'transparent',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {checked && (
          <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 700 }}>✓</span>
        )}
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1 }}>{label}</span>
    </button>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function RefSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: 'var(--muted-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: 6,
          marginTop: 4,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

// ─── TaskReferencePicker ──────────────────────────────────────────────────────

interface TaskReferencePickerProps {
  taskId: string;
  projectId: string;
}

export function TaskReferencePicker({ taskId, projectId }: TaskReferencePickerProps) {
  const { data: refs = [] } = useTaskReferences(taskId);
  const { data: samples = [] } = useProjectSamples(projectId);
  const { data: experiments = [] } = useProjectExperiments(projectId);
  const { data: pages = [] } = useProjectPages(projectId);
  const addRef = useAddReference(taskId);
  const removeRef = useRemoveReference(taskId);

  const isChecked = (refType: 'sample' | 'experiment' | 'page', refId: string) =>
    refs.some(r => r.ref_type === refType && r.ref_id === refId);

  const toggle = (refType: 'sample' | 'experiment' | 'page', refId: string) => {
    if (isChecked(refType, refId)) {
      removeRef.mutate({ ref_type: refType, ref_id: refId });
    } else {
      addRef.mutate({ ref_type: refType, ref_id: refId });
    }
  };

  const isBusy = addRef.isPending || removeRef.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Samples */}
      {samples.length > 0 && (
        <RefSection title="Samples">
          {samples.map((s: Sample) => (
            <CheckRow
              key={s.id}
              label={`${s.identifier}${s.name ? ` — ${s.name}` : ''}`}
              checked={isChecked('sample', s.id)}
              onToggle={() => toggle('sample', s.id)}
              disabled={isBusy}
            />
          ))}
        </RefSection>
      )}

      {/* Experiments */}
      {experiments.length > 0 && (
        <RefSection title="Experiments">
          {experiments.map((e: Experiment) => (
            <CheckRow
              key={e.id}
              label={`${e.code ?? e.id.slice(0, 8)}${e.method ? ` — ${e.method}` : ''}`}
              checked={isChecked('experiment', e.id)}
              onToggle={() => toggle('experiment', e.id)}
              disabled={isBusy}
            />
          ))}
        </RefSection>
      )}

      {/* Pages */}
      {pages.length > 0 && (
        <RefSection title="Pages">
          {pages.map((p: PageListItem) => (
            <CheckRow
              key={p.id}
              label={p.title || p.slot || p.id.slice(0, 8)}
              checked={isChecked('page', p.id)}
              onToggle={() => toggle('page', p.id)}
              disabled={isBusy}
            />
          ))}
        </RefSection>
      )}

      {samples.length === 0 && experiments.length === 0 && pages.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)' }}>
          No items in this project yet.
        </div>
      )}
    </div>
  );
}
