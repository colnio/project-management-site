/**
 * C4 — Sample Detail Page
 * Route: /samples/:sampleId
 * Shows title/header + optional Edit panel + BlockNote editor.
 * Identifier strip, linked experiments, and lineage graph now live inside
 * SampleDashboard (rendered as an entityDashboard block within the editor).
 */
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { StatusPill, KindPill } from '@/components/StatusPill';
import {
  useSample,
  useUpdateSample,
} from '@/hooks/useQueries';
import { EntityPageEditor } from '@/components/editor/EntityPageEditor';
import type { Sample } from '@/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── JSONB Property Editor ────────────────────────────────────────────────────

interface PropertyEditorProps {
  properties: Record<string, unknown>;
  onChange: (props: Record<string, unknown>) => void;
}

export function PropertyEditor({ properties, onChange }: PropertyEditorProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [addMode, setAddMode] = useState(false);

  const entries = Object.entries(properties);

  const updateValue = (key: string, rawVal: string) => {
    let parsed: unknown = rawVal;
    try { parsed = JSON.parse(rawVal); } catch { /* keep string */ }
    onChange({ ...properties, [key]: parsed });
    setEditingKey(null);
  };

  const removeKey = (key: string) => {
    const next = { ...properties };
    delete next[key];
    onChange(next);
  };

  const addEntry = () => {
    if (!newKey.trim()) return;
    let parsed: unknown = newVal;
    try { parsed = JSON.parse(newVal); } catch { /* keep string */ }
    onChange({ ...properties, [newKey.trim()]: parsed });
    setNewKey('');
    setNewVal('');
    setAddMode(false);
  };

  const displayValue = (v: unknown) => {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  };

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {entries.length === 0 && !addMode && (
        <div style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-2)' }}>
          No properties
        </div>
      )}

      {entries.map(([key, val]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--line)', gap: 10, minHeight: 38 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ember)', flex: '0 0 140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {key}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted-2)', flex: '0 0 auto', marginRight: 4 }}>:</span>
          {editingKey === key ? (
            <input
              autoFocus
              defaultValue={displayValue(val)}
              onBlur={e => updateValue(key, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') updateValue(key, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingKey(null); }}
              style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12.5, background: 'var(--paper-2)', border: '1px solid var(--ember-soft)', borderRadius: 4, padding: '2px 8px', outline: 'none' }}
            />
          ) : (
            <span
              onClick={() => setEditingKey(key)}
              style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink)', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={displayValue(val)}
            >
              {displayValue(val)}
            </span>
          )}
          <button onClick={() => removeKey(key)} className="icon-btn" style={{ fontSize: 11, color: 'var(--bad)', flexShrink: 0 }}>✕</button>
        </div>
      ))}

      {addMode ? (
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', background: 'var(--paper-2)', borderTop: entries.length > 0 ? '1px solid var(--line)' : undefined }}>
          <input
            placeholder="key"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '3px 8px', width: 120, outline: 'none' }}
          />
          <span style={{ color: 'var(--muted-2)', alignSelf: 'center' }}>:</span>
          <input
            placeholder="value or JSON"
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addEntry(); if (e.key === 'Escape') setAddMode(false); }}
            style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '3px 8px', flex: 1, outline: 'none' }}
          />
          <button className="top-btn primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={addEntry}>Add</button>
          <button className="icon-btn" onClick={() => { setAddMode(false); setNewKey(''); setNewVal(''); }}>✕</button>
        </div>
      ) : (
        <div style={{ borderTop: entries.length > 0 ? '1px solid var(--line)' : undefined }}>
          <button
            onClick={() => setAddMode(true)}
            style={{ display: 'block', width: '100%', padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', textAlign: 'left', background: 'transparent', borderRadius: 0 }}
          >
            + Add property
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sample edit inline panel ─────────────────────────────────────────────────

const KIND_OPTIONS = ['precursor', 'electrode', 'cell', 'module', 'derivative', 'other'] as const;
const SAMPLE_STATUS_OPTIONS = ['active', 'consumed', 'archived', 'failed'] as const;

type SampleUpdateBody = Parameters<ReturnType<typeof useUpdateSample>['mutateAsync']>[0];

interface EditPanelProps {
  sample: Sample;
  onSave: (data: SampleUpdateBody) => Promise<unknown>;
  saving: boolean;
}

function EditPanel({ sample, onSave, saving }: EditPanelProps) {
  const [identifier, setIdentifier] = useState(sample.identifier);
  const [name, setName] = useState(sample.name);
  const [description, setDescription] = useState(sample.description);
  const [kind, setKind] = useState(sample.kind);
  const [status, setStatus] = useState(sample.status);
  const [properties, setProperties] = useState<Record<string, unknown>>(
    (sample.properties && typeof sample.properties === 'object' && !Array.isArray(sample.properties))
      ? sample.properties as Record<string, unknown>
      : {}
  );
  const [dirty, setDirty] = useState(false);

  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const handleSave = () => {
    void onSave({ identifier, name, description, kind, status, properties: properties as unknown as Record<string, unknown> });
    setDirty(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
        {dirty && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--warn)', alignSelf: 'center' }}>unsaved changes</span>}
        <button className="top-btn primary" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FieldGroup label="Identifier">
          <input className="field-input" value={identifier} onChange={e => markDirty(setIdentifier)(e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Name">
          <input className="field-input" value={name} onChange={e => markDirty(setName)(e.target.value)} />
        </FieldGroup>
      </div>

      <FieldGroup label="Description">
        <textarea className="field-textarea" value={description} onChange={e => markDirty(setDescription)(e.target.value)} rows={3} />
      </FieldGroup>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Kind</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {KIND_OPTIONS.map(k => (
              <button key={k} onClick={() => { markDirty(setKind)(k); }} className={`status-opt${kind === k ? ' sel' : ''}`}>
                <KindPill kind={k} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Status</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SAMPLE_STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => { markDirty(setStatus)(s); }} className={`status-opt${status === s ? ' sel' : ''}`}>
                <StatusPill status={s} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <FieldGroup label="Properties (JSONB)">
        <PropertyEditor
          properties={properties}
          onChange={p => { setProperties(p); setDirty(true); }}
        />
      </FieldGroup>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SampleDetailPage() {
  const { sampleId } = useParams({ strict: false }) as { sampleId: string };
  const { data: sample, isLoading, isError } = useSample(sampleId);
  const updateSample = useUpdateSample(sampleId, sample?.project_id ?? '');
  const [editOpen, setEditOpen] = useState(false);

  const crumbs = [
    { label: 'Project', href: sample ? `/projects/${sample.project_id}?tab=samples` : '/workspaces' },
    { label: sample ? `${sample.identifier}` : 'Sample' },
  ];

  if (isLoading) return <AppShell topBarCrumbs={crumbs}><LoadingState /></AppShell>;
  if (isError || !sample) return <AppShell topBarCrumbs={crumbs}><ErrorState message="Failed to load sample." /></AppShell>;

  return (
    <AppShell activeProjectId={sample.project_id} topBarCrumbs={crumbs}>
      <div className="page-wrap wide" style={{ paddingTop: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 8px', lineHeight: 1.25 }}>
              {sample.name || sample.identifier}
            </h1>
            {sample.description && (
              <p style={{ margin: '0 0 0', fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 640 }}>
                {sample.description}
              </p>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            <button
              className="top-btn primary"
              onClick={() => setEditOpen(o => !o)}
            >
              {editOpen ? 'Close Editor' : 'Edit'}
            </button>
          </div>
        </div>

        {/* Edit panel (toggled) */}
        {editOpen && (
          <div style={{ marginBottom: 32, padding: '20px', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 10 }}>
            <div className="section-h" style={{ marginBottom: 16, marginTop: 0 }}>
              <h2>Edit Details</h2>
            </div>
            <EditPanel
              sample={sample}
              onSave={data => updateSample.mutateAsync(data)}
              saving={updateSample.isPending}
            />
          </div>
        )}

        {/* Entity page editor (contains entityDashboard block with identifier/experiments/lineage + notes) */}
        <EntityPageEditor
          parentType="sample"
          parentId={sampleId}
          projectId={sample.project_id}
          slot="description"
        />
      </div>
    </AppShell>
  );
}
