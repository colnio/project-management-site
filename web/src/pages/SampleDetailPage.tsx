/**
 * C4 — Sample Detail Page
 * Route: /samples/:sampleId
 * Shows editable fields, a freeform JSONB property editor, and a React Flow
 * lineage graph from /v1/samples/{id}/lineage.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill, KindPill } from '@/components/StatusPill';
import {
  useSample,
  useUpdateSample,
  useSampleLineage,
  useAddSampleRelation,
  useProjectSamples,
  useProjectArtifacts,
} from '@/hooks/useQueries';
import {
  useSampleArtifacts,
  useAttachArtifactToSample,
  useArtifact,
} from '@/hooks/useArtifactQueries';
import { ArtifactThumbnail, ArtifactDetailModal } from '@/components/ArtifactViewer';
import type { Sample, Artifact } from '@/api/types';
import type { LineageGraph } from '@/hooks/useQueries';

// ─── Sample Artifact Attach section ──────────────────────────────────────────

const SAMPLE_ARTIFACT_ROLES = ['specimen_image', 'datasheet', 'reference', 'other'] as const;
type SampleArtifactRole = typeof SAMPLE_ARTIFACT_ROLES[number];

function SampleArtifactsSection({ sampleId, projectId }: { sampleId: string; projectId: string }) {
  const { data: attached = [], isLoading } = useSampleArtifacts(sampleId);
  const { data: projectArtifacts = [] } = useProjectArtifacts(projectId);
  const attachMut = useAttachArtifactToSample(sampleId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const [role, setRole] = useState<SampleArtifactRole>('other');
  const [detailArtifact, setDetailArtifact] = useState<Artifact | null>(null);

  // Filter out already-attached artifacts
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
    <div style={{ marginTop: 40 }}>
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
                  {SAMPLE_ARTIFACT_ROLES.map(r => (
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
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-2)', padding: '12px 0' }}>No artifacts attached.</div>
      ) : (
        <div className="arti-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {attached.map(sa => (
            <AttachedArtifactCard key={sa.artifact_id} artifactId={sa.artifact_id} role={sa.role} onOpen={setDetailArtifact} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachedArtifactCard({ artifactId, role, onOpen }: { artifactId: string; role?: string; onOpen: (a: Artifact) => void }) {
  const { data: artifact } = useArtifact(artifactId);
  if (!artifact) return null;
  return (
    <div className="arti" style={{ cursor: 'pointer' }} onClick={() => onOpen(artifact)}>
      <div className="ahead">
        <ArtifactThumbnail artifact={artifact} />
        {role && <span className="tt">{role.replace('_', ' ')}</span>}
      </div>
      <div className="ameta">
        <div className="aname">{artifact.filename}</div>
        <div className="asub">{artifact.type} · {artifact.processing_status}</div>
      </div>
    </div>
  );
}

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

// ─── Lineage Graph (React Flow) ───────────────────────────────────────────────

function lineageToFlow(graph: LineageGraph, focusId: string): { nodes: Node[]; edges: Edge[] } {
  const sampleNodes = graph.nodes ?? [];
  const graphEdges = graph.edges ?? [];

  const kindColor: Record<string, string> = {
    precursor: '#f0eadc',
    electrode: '#e6eef0',
    cell: '#f2dccf',
    module: '#e1ebde',
    derivative: '#eae2ef',
    other: '#f3f1eb',
  };

  // ─── Deterministic layered layout ────────────────────────────────────────────
  // Assign each node a "depth" (row) relative to the focus node by walking the
  // parent→child edges, then index siblings within a depth into columns. This
  // guarantees every node gets a distinct, on-screen position so the graph is
  // visible (the previous logic collapsed many nodes to the same point).
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string[]>();
  for (const e of graphEdges) {
    if (!childrenOf.has(e.parent_sample_id)) childrenOf.set(e.parent_sample_id, []);
    childrenOf.get(e.parent_sample_id)!.push(e.child_sample_id);
    if (!parentOf.has(e.child_sample_id)) parentOf.set(e.child_sample_id, []);
    parentOf.get(e.child_sample_id)!.push(e.parent_sample_id);
  }

  const depth = new Map<string, number>();
  const queue: string[] = [focusId];
  depth.set(focusId, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const c of childrenOf.get(id) ?? []) {
      if (!depth.has(c)) { depth.set(c, d + 1); queue.push(c); }
    }
    for (const p of parentOf.get(id) ?? []) {
      if (!depth.has(p)) { depth.set(p, d - 1); queue.push(p); }
    }
  }

  // Any node not reachable from focus (disconnected) gets stacked below.
  let orphanDepth = Math.max(0, ...depth.values()) + 1;
  for (const s of sampleNodes) {
    if (!depth.has(s.id)) depth.set(s.id, orphanDepth++);
  }

  // Group by depth (row), index within each row (column).
  const rowCounts = new Map<number, number>();
  const minDepth = Math.min(0, ...depth.values());

  const nodes: Node[] = sampleNodes.map(s => {
    const d = depth.get(s.id) ?? 0;
    const col = rowCounts.get(d) ?? 0;
    rowCounts.set(d, col + 1);
    const row = d - minDepth;
    const x = col * 220;
    const y = row * 120;

    return {
      id: s.id,
      type: 'default',
      position: { x, y },
      data: { label: `${s.identifier}\n${s.name || s.kind}` },
      style: {
        background: kindColor[s.kind] ?? '#f3f1eb',
        border: s.id === focusId ? '2px solid var(--ember)' : '1px solid var(--line-2)',
        borderRadius: 8,
        fontSize: 12,
        fontFamily: 'var(--mono)',
        padding: '8px 12px',
        minWidth: 120,
        textAlign: 'center' as const,
      },
    };
  });

  const edges: Edge[] = graphEdges.map((e, i) => ({
    id: `e${i}`,
    source: e.parent_sample_id,
    target: e.child_sample_id,
    label: e.relation_type.replace(/_/g, ' '),
    type: 'smoothstep',
    style: { stroke: 'var(--muted-2)', strokeWidth: 1.5 },
    labelStyle: { fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--muted)' },
    animated: false,
  }));

  return { nodes, edges };
}

interface LineageFlowProps {
  sampleId: string;
}

const RELATION_TYPES = ['derived_from', 'split_from', 'assembled_into', 'tested_as', 'duplicate_of'] as const;

function LineageFlow({ sampleId }: LineageFlowProps) {
  const { data: lineage, isLoading, isError } = useSampleLineage(sampleId);
  const { data: sample } = useSample(sampleId);
  const addRelation = useAddSampleRelation(sampleId);

  const [relOpen, setRelOpen] = useState(false);
  const [relType, setRelType] = useState<string>('derived_from');
  const [relChildId, setRelChildId] = useState('');
  const [relNotes, setRelNotes] = useState('');

  const { nodes: initNodes, edges: initEdges } = lineage
    ? lineageToFlow(lineage, sampleId)
    : { nodes: [], edges: [] };

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const onConnect = useCallback((params: Connection) => setEdges(eds => addEdge(params, eds)), [setEdges]);

  // Lineage loads asynchronously, so useNodesState's initial value is empty on
  // first render. Re-sync the flow state once the lineage data arrives/changes.
  useEffect(() => {
    if (!lineage) return;
    const { nodes: n, edges: e } = lineageToFlow(lineage, sampleId);
    setNodes(n);
    setEdges(e);
  }, [lineage, sampleId, setNodes, setEdges]);

  if (isLoading) return <LoadingState message="Loading lineage…" />;
  if (isError) return <ErrorState message="Could not load lineage." />;

  const nodeCount = lineage?.nodes?.length ?? 0;

  return (
    <div>
      <div className="section-h" style={{ marginBottom: 8 }}>
        <h2>Lineage Graph</h2>
        <span className="meta">{nodeCount} nodes</span>
        <div className="right">
          <button className="top-btn primary" onClick={() => setRelOpen(true)}>+ Add relation</button>
        </div>
      </div>

      {relOpen && (
        <div className="modal-overlay" onClick={() => setRelOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">Add Relation</span>
              <button className="icon-btn" onClick={() => setRelOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <FieldGroup label="Relation type">
                <select className="field-input" value={relType} onChange={e => setRelType(e.target.value)}>
                  {RELATION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Child sample ID">
                <input className="field-input" value={relChildId} onChange={e => setRelChildId(e.target.value)} placeholder="sample UUID" />
              </FieldGroup>
              <FieldGroup label="Notes (optional)">
                <input className="field-input" value={relNotes} onChange={e => setRelNotes(e.target.value)} placeholder="notes" />
              </FieldGroup>
            </div>
            <div className="modal-foot">
              <button className="top-btn" onClick={() => setRelOpen(false)}>Cancel</button>
              <button className="top-btn primary" disabled={!relChildId || addRelation.isPending} onClick={async () => {
                await addRelation.mutateAsync({ child_sample_id: relChildId, relation_type: relType, notes: relNotes || undefined });
                setRelOpen(false);
              }}>
                {addRelation.isPending ? 'Adding…' : 'Add relation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {nodeCount === 0 ? (
        <EmptyState message="No lineage data yet. Add a relation to get started." />
      ) : (
        <div style={{ height: 420, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--paper)' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable
            attributionPosition="bottom-right"
          >
            <Background color="var(--line)" gap={16} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={2}
              style={{ border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)' }}
            />
          </ReactFlow>
        </div>
      )}
      {/* suppress unused var warning */ void sample}
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
  const filterRef = useRef('');
  const { data: projectSamples = [] } = useProjectSamples(sample?.project_id);

  // We only use projectSamples for the count badge; silence unused warning
  void projectSamples;
  void filterRef;

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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <KindPill kind={sample.kind} />
              <StatusPill status={sample.status} />
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 4px', lineHeight: 1.25 }}>
              {sample.name || sample.identifier}
            </h1>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ember)' }}>{sample.identifier}</div>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginBottom: 48 }}>
          {/* Left: edit panel */}
          <div>
            <div className="section-h" style={{ marginBottom: 16, marginTop: 0 }}>
              <h2>Details</h2>
            </div>
            <EditPanel
              sample={sample}
              onSave={data => updateSample.mutateAsync(data)}
              saving={updateSample.isPending}
            />
          </div>

          {/* Right: meta */}
          <div>
            <div className="section-h" style={{ marginTop: 0, marginBottom: 16 }}>
              <h2>Info</h2>
            </div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
              {[
                { label: 'ID', value: sample.id },
                { label: 'Project', value: sample.project_id },
                { label: 'Created', value: new Date(sample.created_at).toLocaleString() },
                { label: 'Updated', value: new Date(sample.updated_at).toLocaleString() },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', padding: '10px 14px', borderBottom: '1px solid var(--line)', gap: 16 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)', width: 80, flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Artifacts */}
        <SampleArtifactsSection sampleId={sampleId} projectId={sample.project_id} />

        {/* Lineage Graph */}
        <LineageFlow sampleId={sampleId} />
      </div>
    </AppShell>
  );
}
