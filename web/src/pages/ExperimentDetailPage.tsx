/**
 * C5 — Experiment Detail Page
 * Route: /experiments/:experimentId
 * Method-specific parameter forms + result summary + status control + sample picker.
 */
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import {
  useExperiment,
  useUpdateExperiment,
  useExperimentSamples,
  useLinkExperimentSample,
  useUnlinkExperimentSample,
  useProjectSamples,
  useProjectArtifacts,
} from '@/hooks/useQueries';
import {
  useExperimentArtifacts,
  useAttachArtifactToExperiment,
  useArtifact,
} from '@/hooks/useArtifactQueries';
import { ArtifactDetailModal } from '@/components/ArtifactViewer';
import { ArtImage, ArtPDF, ArtNotebook, ArtEmbed } from '@/components/embeds/ArtEmbeds';
import type { Sample, Artifact } from '@/api/types';
import type { ExperimentSample } from '@/hooks/useQueries';

// ─── Experiment Artifact section ──────────────────────────────────────────────

const EXP_ARTIFACT_ROLES = ['raw_data', 'analysis', 'report', 'calibration', 'photo', 'other'] as const;
type ExpArtifactRole = typeof EXP_ARTIFACT_ROLES[number];

function ExperimentArtifactsSection({ experimentId, projectId }: { experimentId: string; projectId: string }) {
  const { data: attached = [], isLoading } = useExperimentArtifacts(experimentId);
  const { data: projectArtifacts = [] } = useProjectArtifacts(projectId);
  const attachMut = useAttachArtifactToExperiment(experimentId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const [role, setRole] = useState<ExpArtifactRole>('other');
  const [detailArtifact, setDetailArtifact] = useState<Artifact | null>(null);

  const attachedIds = new Set(attached.map(a => a.artifact_id));
  const available = projectArtifacts.filter(a => !attachedIds.has(a.id));

  const handleAttach = async () => {
    if (!selectedArtifactId) return;
    await attachMut.mutateAsync({ artifact_id: selectedArtifactId, role });
    setPickerOpen(false);
    setSelectedArtifactId('');
  };

  if (isLoading) return null;

  return (
    <div style={{ marginTop: 32 }}>
      {detailArtifact && (
        <ArtifactDetailModal artifact={detailArtifact} onClose={() => setDetailArtifact(null)} />
      )}
      {pickerOpen && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">Attach Artifact</span>
              <button className="icon-btn" onClick={() => setPickerOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Artifact</div>
                {available.length === 0 ? (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>All project artifacts already attached.</div>
                ) : (
                  <select className="field-input" value={selectedArtifactId} onChange={e => setSelectedArtifactId(e.target.value)}>
                    <option value="">— select artifact —</option>
                    {available.map(a => (
                      <option key={a.id} value={a.id}>{a.filename} ({a.type})</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Role</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {EXP_ARTIFACT_ROLES.map(r => (
                    <button key={r} onClick={() => setRole(r)} className={`status-opt${role === r ? ' sel' : ''}`}>{r.replace('_', ' ')}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="top-btn" onClick={() => setPickerOpen(false)}>Cancel</button>
              <button className="top-btn primary" disabled={!selectedArtifactId || attachMut.isPending} onClick={() => void handleAttach()}>
                {attachMut.isPending ? 'Attaching…' : 'Attach'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="section-h" style={{ marginBottom: 14 }}>
        <h2>Artifacts</h2>
        <span className="meta">{attached.length}</span>
        <div className="right">
          <button className="top-btn primary" onClick={() => setPickerOpen(true)}>+ Attach</button>
        </div>
      </div>

      {attached.length === 0 ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-2)', padding: '8px 0' }}>No artifacts attached.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          {attached.map(ea => (
            <ExpAttachedArtifactRow key={ea.artifact_id} artifactId={ea.artifact_id} role={ea.role} onOpen={setDetailArtifact} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExpAttachedArtifactRow({ artifactId, role, onOpen }: { artifactId: string; role?: string; onOpen: (a: Artifact) => void }) {
  const { data: artifact } = useArtifact(artifactId);
  if (!artifact) return null;
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--line)', gap: 12, cursor: 'pointer' }}
      onClick={() => onOpen(artifact)}
    >
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)' }}>{artifact.type}</span>
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artifact.filename}</span>
      {role && <span className="pill">{role.replace('_', ' ')}</span>}
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>{artifact.processing_status}</span>
    </div>
  );
}

// ─── Method-specific artifact embed view ──────────────────────────────────────

/** Pick the right embed component for a given artifact + experiment method. */
function MethodArtifactEmbed({ artifact, method }: { artifact: Artifact; method: string }) {
  if (method === 'SEM') {
    // SEM → ArtImage with scale-bar styling (pull from artifact metadata if present)
    return <ArtImage artifact={artifact} />;
  }
  if (method === 'EIS') {
    // EIS → PDF for reports, Notebook for analysis, generic otherwise
    if (artifact.type === 'pdf') return <ArtPDF artifact={artifact} />;
    if (artifact.type === 'ipynb') return <ArtNotebook artifact={artifact} />;
    return <ArtEmbed artifact={artifact} />;
  }
  if (method === 'cycling') {
    // Cycling → image primary (voltage/capacity curves), notebook for analysis
    if (artifact.type === 'image') return <ArtImage artifact={artifact} />;
    if (artifact.type === 'ipynb') return <ArtNotebook artifact={artifact} />;
    return <ArtEmbed artifact={artifact} />;
  }
  // Fallback for XRD, synthesis, weighing, drying, custom
  return <ArtEmbed artifact={artifact} />;
}

function ExperimentArtifactEmbeds({ experimentId, method }: { experimentId: string; method: string }) {
  const { data: attached = [], isLoading } = useExperimentArtifacts(experimentId);
  if (isLoading || attached.length === 0) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="section-h" style={{ marginTop: 0, marginBottom: 12 }}>
        <h2>Artifact Embeds</h2>
        <span className="meta">{attached.length} · {method}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {attached.map(ea => (
          <ExperimentArtifactEmbedItem key={ea.artifact_id} artifactId={ea.artifact_id} method={method} />
        ))}
      </div>
    </div>
  );
}

function ExperimentArtifactEmbedItem({ artifactId, method }: { artifactId: string; method: string }) {
  const { data: artifact } = useArtifact(artifactId);
  if (!artifact) return null;
  return <MethodArtifactEmbed artifact={artifact} method={method} />;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpMethod = 'cycling' | 'synthesis' | 'SEM' | 'XRD' | 'EIS' | 'weighing' | 'drying' | 'custom';
type ExpStatus = 'planned' | 'in_progress' | 'completed' | 'failed';
const METHODS: ExpMethod[] = ['cycling', 'synthesis', 'SEM', 'XRD', 'EIS', 'weighing', 'drying', 'custom'];
const STATUSES: ExpStatus[] = ['planned', 'in_progress', 'completed', 'failed'];

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

// ─── Method-specific parameter forms ─────────────────────────────────────────

interface ParamFormProps {
  method: ExpMethod;
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}

function CyclingForm({ params, onChange }: Omit<ParamFormProps, 'method'>) {
  const g = (k: string, def = '') => String(params[k] ?? def);
  const s = (k: string) => (v: string) => onChange({ ...params, [k]: v });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <FieldGroup label="C-rate">
        <input className="field-input" value={g('c_rate')} onChange={e => s('c_rate')(e.target.value)} placeholder="e.g. 0.1C" />
      </FieldGroup>
      <FieldGroup label="Cycles">
        <input className="field-input" type="number" value={g('cycles')} onChange={e => s('cycles')(e.target.value)} placeholder="e.g. 100" />
      </FieldGroup>
      <FieldGroup label="Voltage min (V)">
        <input className="field-input" type="number" value={g('v_min')} onChange={e => s('v_min')(e.target.value)} placeholder="e.g. 2.5" step="0.01" />
      </FieldGroup>
      <FieldGroup label="Voltage max (V)">
        <input className="field-input" type="number" value={g('v_max')} onChange={e => s('v_max')(e.target.value)} placeholder="e.g. 4.3" step="0.01" />
      </FieldGroup>
      <FieldGroup label="Temperature (°C)">
        <input className="field-input" type="number" value={g('temp_c')} onChange={e => s('temp_c')(e.target.value)} placeholder="e.g. 25" />
      </FieldGroup>
      <FieldGroup label="Electrolyte">
        <input className="field-input" value={g('electrolyte')} onChange={e => s('electrolyte')(e.target.value)} placeholder="e.g. 1M LiPF6 EC:DMC" />
      </FieldGroup>
    </div>
  );
}

function XRDForm({ params, onChange }: Omit<ParamFormProps, 'method'>) {
  const g = (k: string, def = '') => String(params[k] ?? def);
  const s = (k: string) => (v: string) => onChange({ ...params, [k]: v });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <FieldGroup label="2θ start (°)">
        <input className="field-input" type="number" value={g('two_theta_start')} onChange={e => s('two_theta_start')(e.target.value)} placeholder="e.g. 10" step="0.01" />
      </FieldGroup>
      <FieldGroup label="2θ end (°)">
        <input className="field-input" type="number" value={g('two_theta_end')} onChange={e => s('two_theta_end')(e.target.value)} placeholder="e.g. 80" step="0.01" />
      </FieldGroup>
      <FieldGroup label="Step size (°)">
        <input className="field-input" type="number" value={g('step')} onChange={e => s('step')(e.target.value)} placeholder="e.g. 0.02" step="0.001" />
      </FieldGroup>
      <FieldGroup label="Scan rate (°/min)">
        <input className="field-input" type="number" value={g('scan_rate')} onChange={e => s('scan_rate')(e.target.value)} placeholder="e.g. 2" />
      </FieldGroup>
      <FieldGroup label="Radiation">
        <input className="field-input" value={g('radiation')} onChange={e => s('radiation')(e.target.value)} placeholder="e.g. Cu Kα" />
      </FieldGroup>
      <FieldGroup label="Detector">
        <input className="field-input" value={g('detector')} onChange={e => s('detector')(e.target.value)} placeholder="e.g. LYNXEYE" />
      </FieldGroup>
    </div>
  );
}

function EISForm({ params, onChange }: Omit<ParamFormProps, 'method'>) {
  const g = (k: string, def = '') => String(params[k] ?? def);
  const s = (k: string) => (v: string) => onChange({ ...params, [k]: v });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <FieldGroup label="Freq. min (Hz)">
        <input className="field-input" type="number" value={g('freq_min')} onChange={e => s('freq_min')(e.target.value)} placeholder="e.g. 0.01" />
      </FieldGroup>
      <FieldGroup label="Freq. max (Hz)">
        <input className="field-input" type="number" value={g('freq_max')} onChange={e => s('freq_max')(e.target.value)} placeholder="e.g. 100000" />
      </FieldGroup>
      <FieldGroup label="Amplitude (mV)">
        <input className="field-input" type="number" value={g('amplitude_mv')} onChange={e => s('amplitude_mv')(e.target.value)} placeholder="e.g. 10" />
      </FieldGroup>
      <FieldGroup label="Points per decade">
        <input className="field-input" type="number" value={g('points_per_decade')} onChange={e => s('points_per_decade')(e.target.value)} placeholder="e.g. 10" />
      </FieldGroup>
    </div>
  );
}

function SEMForm({ params, onChange }: Omit<ParamFormProps, 'method'>) {
  const g = (k: string, def = '') => String(params[k] ?? def);
  const s = (k: string) => (v: string) => onChange({ ...params, [k]: v });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <FieldGroup label="Accelerating voltage (kV)">
        <input className="field-input" type="number" value={g('voltage_kv')} onChange={e => s('voltage_kv')(e.target.value)} placeholder="e.g. 5" step="0.1" />
      </FieldGroup>
      <FieldGroup label="Working distance (mm)">
        <input className="field-input" type="number" value={g('wd_mm')} onChange={e => s('wd_mm')(e.target.value)} placeholder="e.g. 10" step="0.1" />
      </FieldGroup>
      <FieldGroup label="Magnification">
        <input className="field-input" value={g('magnification')} onChange={e => s('magnification')(e.target.value)} placeholder="e.g. 5000x" />
      </FieldGroup>
      <FieldGroup label="Detector mode">
        <input className="field-input" value={g('detector_mode')} onChange={e => s('detector_mode')(e.target.value)} placeholder="e.g. SE, BSE" />
      </FieldGroup>
    </div>
  );
}

function WeighingDryingForm({ method, params, onChange }: ParamFormProps) {
  const g = (k: string, def = '') => String(params[k] ?? def);
  const s = (k: string) => (v: string) => onChange({ ...params, [k]: v });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <FieldGroup label="Mass before (mg)">
        <input className="field-input" type="number" value={g('mass_before_mg')} onChange={e => s('mass_before_mg')(e.target.value)} placeholder="e.g. 120.5" step="0.01" />
      </FieldGroup>
      <FieldGroup label="Mass after (mg)">
        <input className="field-input" type="number" value={g('mass_after_mg')} onChange={e => s('mass_after_mg')(e.target.value)} placeholder="e.g. 118.3" step="0.01" />
      </FieldGroup>
      {method === 'drying' && (
        <>
          <FieldGroup label="Temperature (°C)">
            <input className="field-input" type="number" value={g('temp_c')} onChange={e => s('temp_c')(e.target.value)} placeholder="e.g. 120" />
          </FieldGroup>
          <FieldGroup label="Duration (h)">
            <input className="field-input" type="number" value={g('duration_h')} onChange={e => s('duration_h')(e.target.value)} placeholder="e.g. 12" step="0.5" />
          </FieldGroup>
        </>
      )}
    </div>
  );
}

// Generic key-value fallback for synthesis, custom, etc.
function GenericParamForm({ params, onChange }: Omit<ParamFormProps, 'method'>) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const removeKey = (key: string) => {
    const next = { ...params };
    delete next[key];
    onChange(next);
  };

  const addEntry = () => {
    if (!newKey.trim()) return;
    let parsed: unknown = newVal;
    try { parsed = JSON.parse(newVal); } catch { /* keep string */ }
    onChange({ ...params, [newKey.trim()]: parsed });
    setNewKey('');
    setNewVal('');
  };

  const displayValue = (v: unknown) => typeof v === 'string' ? v : JSON.stringify(v);

  return (
    <div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
        {Object.entries(params).length === 0 && (
          <div style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-2)' }}>No parameters yet</div>
        )}
        {Object.entries(params).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--line)', gap: 10 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ember)', flex: '0 0 140px' }}>{key}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, flex: 1 }}>{displayValue(val)}</span>
            <button onClick={() => removeKey(key)} className="icon-btn" style={{ color: 'var(--bad)' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', background: 'var(--paper-2)' }}>
          <input placeholder="key" value={newKey} onChange={e => setNewKey(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '3px 8px', width: 120, outline: 'none' }} />
          <span style={{ color: 'var(--muted-2)', alignSelf: 'center' }}>:</span>
          <input placeholder="value or JSON" value={newVal} onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addEntry()}
            style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '3px 8px', flex: 1, outline: 'none' }} />
          <button className="top-btn primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={addEntry}>Add</button>
        </div>
      </div>
    </div>
  );
}

function MethodParamForm({ method, params, onChange }: ParamFormProps) {
  if (method === 'cycling') return <CyclingForm params={params} onChange={onChange} />;
  if (method === 'XRD') return <XRDForm params={params} onChange={onChange} />;
  if (method === 'EIS') return <EISForm params={params} onChange={onChange} />;
  if (method === 'SEM') return <SEMForm params={params} onChange={onChange} />;
  if (method === 'weighing' || method === 'drying') return <WeighingDryingForm method={method} params={params} onChange={onChange} />;
  return <GenericParamForm params={params} onChange={onChange} />;
}

// ─── Sample Picker ────────────────────────────────────────────────────────────

const SAMPLE_ROLES = ['subject', 'reference', 'control', 'byproduct'] as const;

interface SamplePickerProps {
  experimentId: string;
  projectId: string;
  linked: ExperimentSample[];
  onClose: () => void;
}

function SamplePicker({ experimentId, projectId, linked, onClose }: SamplePickerProps) {
  const { data: allSamples = [] } = useProjectSamples(projectId);
  const [selectedId, setSelectedId] = useState('');
  const [role, setRole] = useState('subject');
  const [note, setNote] = useState('');
  const linkMut = useLinkExperimentSample(experimentId);

  const linkedIds = new Set(linked.map(s => s.sample_id));
  const available = allSamples.filter((s: Sample) => !linkedIds.has(s.id));

  const handleLink = async () => {
    if (!selectedId) return;
    await linkMut.mutateAsync({ sample_id: selectedId, role, note: note || undefined });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Link Sample</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <FieldGroup label="Sample">
            {available.length === 0 ? (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>All samples already linked.</div>
            ) : (
              <select className="field-input" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                <option value="">— select sample —</option>
                {available.map((s: Sample) => (
                  <option key={s.id} value={s.id}>{s.identifier} · {s.name || s.kind}</option>
                ))}
              </select>
            )}
          </FieldGroup>
          <FieldGroup label="Role">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SAMPLE_ROLES.map(r => (
                <button key={r} onClick={() => setRole(r)} className={`status-opt${role === r ? ' sel' : ''}`}>{r}</button>
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label="Note (optional)">
            <input className="field-input" value={note} onChange={e => setNote(e.target.value)} placeholder="optional note" />
          </FieldGroup>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button className="top-btn primary" disabled={!selectedId || linkMut.isPending} onClick={handleLink}>
            {linkMut.isPending ? 'Linking…' : 'Link sample'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Linked sample row ────────────────────────────────────────────────────────

function LinkedSampleRow({ item, experimentId }: { item: ExperimentSample; experimentId: string }) {
  const unlink = useUnlinkExperimentSample(experimentId);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)', flex: '0 0 auto' }}>
        {item.sample_id.slice(0, 8)}
      </span>
      {item.role && <span className="pill">{item.role}</span>}
      {item.note && <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1 }}>{item.note}</span>}
      <button
        className="icon-btn"
        style={{ marginLeft: 'auto', color: 'var(--bad)' }}
        onClick={() => unlink.mutate(item.sample_id)}
        title="Unlink"
      >✕</button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ExperimentDetailPage() {
  const { experimentId } = useParams({ strict: false }) as { experimentId: string };
  const { data: experiment, isLoading, isError } = useExperiment(experimentId);
  const { data: linkedSamples = [] } = useExperimentSamples(experimentId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [status, setStatus] = useState<ExpStatus | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, unknown> | null>(null);
  const [performedAt, setPerformedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const updateExp = useUpdateExperiment(experimentId, experiment?.project_id ?? '');

  const crumbs = [
    { label: 'Project', href: experiment ? `/projects/${experiment.project_id}?tab=experiments` : '/workspaces' },
    { label: experiment ? `${experiment.method} experiment` : 'Experiment' },
  ];

  if (isLoading) return <AppShell topBarCrumbs={crumbs}><LoadingState /></AppShell>;
  if (isError || !experiment) return <AppShell topBarCrumbs={crumbs}><ErrorState message="Failed to load experiment." /></AppShell>;

  const currentStatus = status ?? experiment.status as ExpStatus;
  const currentSummary = resultSummary ?? experiment.result_summary;
  const currentParams = params ?? (
    (experiment.parameters && typeof experiment.parameters === 'object' && !Array.isArray(experiment.parameters))
      ? experiment.parameters as Record<string, unknown>
      : {}
  );
  const currentPerformedAt = performedAt ?? experiment.performed_at?.slice(0, 16) ?? '';

  const handleSave = async () => {
    await updateExp.mutateAsync({
      status: currentStatus,
      result_summary: currentSummary,
      parameters: currentParams,
      performed_at: currentPerformedAt ? new Date(currentPerformedAt).toISOString() : undefined,
    });
    setDirty(false);
  };

  const markDirty = () => setDirty(true);

  return (
    <AppShell activeProjectId={experiment.project_id} topBarCrumbs={crumbs}>
      {pickerOpen && (
        <SamplePicker
          experimentId={experimentId}
          projectId={experiment.project_id}
          linked={linkedSamples}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="page-wrap wide" style={{ paddingTop: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }}>
            {/* Code (EX-N) — shown prominently */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                padding: '3px 10px 3px 4px',
                background: 'var(--paper-2)',
                border: '1px solid var(--line)',
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ember)',
                  letterSpacing: '-0.01em',
                }}
              >
                {experiment.code ?? experiment.id.slice(0, 8)}
              </span>
              <span className="pill">{experiment.method}</span>
              <StatusPill status={currentStatus} />
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 4px', lineHeight: 1.25 }}>
              {experiment.result_summary || `${experiment.method} experiment`}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {dirty && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--warn)', alignSelf: 'center' }}>unsaved</span>}
            <button className="top-btn primary" disabled={!dirty || updateExp.isPending} onClick={handleSave}>
              {updateExp.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* Method-specific artifact embeds */}
        <ExperimentArtifactEmbeds experimentId={experimentId} method={experiment.method as string} />

        {/* Main content */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40 }}>
          {/* Left: params + summary */}
          <div>
            {/* Status control */}
            <div className="section-h" style={{ marginTop: 0 }}><h2>Status</h2></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              {STATUSES.map(s => (
                <button key={s} onClick={() => { setStatus(s); markDirty(); }} className={`status-opt${currentStatus === s ? ' sel' : ''}`}>
                  <StatusPill status={s} />
                </button>
              ))}
            </div>

            {/* Method */}
            <div className="section-h"><h2>Method</h2></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              {METHODS.map(m => (
                <span key={m} className={`pill${experiment.method === m ? '' : ''}`} style={{ opacity: experiment.method === m ? 1 : 0.4 }}>{m}</span>
              ))}
            </div>

            {/* Parameters */}
            <div className="section-h"><h2>Parameters</h2></div>
            <div style={{ marginBottom: 28 }}>
              <MethodParamForm
                method={experiment.method as ExpMethod}
                params={currentParams}
                onChange={p => { setParams(p); markDirty(); }}
              />
            </div>

            {/* Result summary */}
            <FieldGroup label="Result Summary">
              <textarea
                className="field-textarea"
                rows={4}
                value={currentSummary}
                onChange={e => { setResultSummary(e.target.value); markDirty(); }}
                placeholder="Describe results, observations, conclusions…"
              />
            </FieldGroup>

            {/* Performed at */}
            <FieldGroup label="Performed At">
              <input
                type="datetime-local"
                className="field-input"
                value={currentPerformedAt}
                onChange={e => { setPerformedAt(e.target.value); markDirty(); }}
              />
            </FieldGroup>
          </div>

          {/* Right: linked samples + meta */}
          <div>
            <div className="section-h" style={{ marginTop: 0 }}>
              <h2>Samples</h2>
              <span className="meta">{linkedSamples.length}</span>
              <div className="right">
                <button className="top-btn primary" onClick={() => setPickerOpen(true)}>+ Link</button>
              </div>
            </div>

            {linkedSamples.length === 0 ? (
              <EmptyState message="No samples linked." />
            ) : (
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
                {linkedSamples.map(s => (
                  <LinkedSampleRow key={s.sample_id} item={s} experimentId={experimentId} />
                ))}
              </div>
            )}

            {/* Artifacts */}
            <ExperimentArtifactsSection experimentId={experimentId} projectId={experiment.project_id} />

            {/* Meta */}
            <div className="section-h"><h2>Meta</h2></div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
              {[
                { label: 'ID', value: experiment.code ?? (experiment.id.slice(0, 16) + '…') },
                { label: 'Created', value: new Date(experiment.created_at).toLocaleDateString() },
                { label: 'Updated', value: new Date(experiment.updated_at).toLocaleDateString() },
                { label: 'Iteration', value: experiment.iteration_id?.slice(0, 8) ?? '—' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', padding: '9px 14px', borderBottom: '1px solid var(--line)', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)', width: 70, flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink)' }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
