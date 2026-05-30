/**
 * SampleDashboard — standalone dashboard component for a sample.
 * Props: { sampleId: string }
 * Renders identifier strip + artifact embeds + linked experiments + lineage graph.
 * Copied from SampleDetailPage.tsx body logic (read-only view).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
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
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill, KindPill } from '@/components/StatusPill';
import {
  useSample,
  useSampleLineage,
  useProjectExperiments,
  useProjectSampleTags,
  useUpdateSample,
} from '@/hooks/useQueries';
import { useSampleArtifacts, useArtifact } from '@/hooks/useArtifactQueries';
import { ArtEmbed } from '@/components/embeds/ArtEmbeds';
import type { Sample, Artifact } from '@/api/types';
import { sampleDisplayTags } from '@/api/types';
import type { LineageGraph } from '@/hooks/useQueries';

// ─── Identifier strip ─────────────────────────────────────────────────────────

function IdentifierStrip({ sample }: { sample: Sample }) {
  const created = new Date(sample.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '8px 12px',
        background: 'var(--paper-2)',
        border: '1px solid var(--line)',
        borderRadius: 6,
        marginBottom: 16,
      }}
    >
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ember)', letterSpacing: '-0.01em' }}>
        {sample.identifier}
      </span>
      <span style={{ color: 'var(--line-2)' }}>·</span>
      <KindPill kind={sample.kind} />
      <StatusPill status={sample.status} />
      <span style={{ color: 'var(--line-2)' }}>·</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>
        {created}
      </span>
    </div>
  );
}

// ─── Artifact embeds (read view) ─────────────────────────────────────────────

function SampleArtifactEmbed({ artifactId }: { artifactId: string }) {
  const { data: artifact } = useArtifact(artifactId);
  if (!artifact) return null;
  return <ArtEmbed artifact={artifact} />;
}

function SampleArtifactEmbeds({ sampleId }: { sampleId: string }) {
  const { data: attached = [], isLoading } = useSampleArtifacts(sampleId);
  if (isLoading || attached.length === 0) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="section-h" style={{ marginTop: 0, marginBottom: 12 }}>
        <h2>Artifact Embeds</h2>
        <span className="meta">{attached.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {attached.map(sa => (
          <SampleArtifactEmbed key={sa.artifact_id} artifactId={sa.artifact_id} />
        ))}
      </div>
    </div>
  );
}

// ─── Linked experiments (read view) ──────────────────────────────────────────

function LinkedExperimentsSection({ projectId }: { projectId: string }) {
  const { data: experiments = [] } = useProjectExperiments(projectId);
  if (experiments.length === 0) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="section-h" style={{ marginTop: 0, marginBottom: 12 }}>
        <h2>Experiments in Project</h2>
        <span className="meta">{experiments.length}</span>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        {experiments.slice(0, 8).map((exp, i, arr) => (
          <Link
            key={exp.id}
            to="/experiments/$experimentId"
            params={{ experimentId: exp.id }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 14px',
              borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : undefined,
              textDecoration: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ember)', flexShrink: 0 }}>
              {(exp as unknown as { code?: string }).code ?? exp.id.slice(0, 6)}
            </span>
            <span className="pill" style={{ flexShrink: 0 }}>{exp.method as string}</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(exp.result_summary as string | undefined) ?? '—'}
            </span>
            <StatusPill status={exp.status as string} />
          </Link>
        ))}
        {experiments.length > 8 && (
          <div style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
            +{experiments.length - 8} more experiments
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lineage Graph ─────────────────────────────────────────────────────────────

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

  let orphanDepth = Math.max(0, ...depth.values()) + 1;
  for (const s of sampleNodes) {
    if (!depth.has(s.id)) depth.set(s.id, orphanDepth++);
  }

  const rowCounts = new Map<number, number>();
  const minDepth = Math.min(0, ...depth.values());

  const nodes: Node[] = sampleNodes.map(s => {
    const d = depth.get(s.id) ?? 0;
    const col = rowCounts.get(d) ?? 0;
    rowCounts.set(d, col + 1);
    const row = d - minDepth;
    return {
      id: s.id,
      type: 'default',
      position: { x: col * 220, y: row * 120 },
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

function LineageFlow({ sampleId }: { sampleId: string }) {
  const { data: lineage, isLoading, isError } = useSampleLineage(sampleId);

  const { nodes: initNodes, edges: initEdges } = lineage
    ? lineageToFlow(lineage, sampleId)
    : { nodes: [], edges: [] };

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const onConnect = useCallback((params: Connection) => setEdges(eds => addEdge(params, eds)), [setEdges]);

  useEffect(() => {
    if (!lineage) return;
    const { nodes: n, edges: e } = lineageToFlow(lineage, sampleId);
    setNodes(n);
    setEdges(e);
  }, [lineage, sampleId, setNodes, setEdges]);

  if (isLoading) return <LoadingState message="Loading lineage…" />;
  if (isError) return <ErrorState message="Could not load lineage." />;

  const nodeCount = lineage?.nodes?.length ?? 0;

  if (nodeCount === 0) return <EmptyState message="No lineage data yet." />;

  return (
    <div style={{ height: 380, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--paper)' }}>
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
  );
}

// ─── SampleDashboard ──────────────────────────────────────────────────────────

export function SampleDashboard({ sampleId }: { sampleId: string }) {
  const { data: sample, isLoading, isError } = useSample(sampleId);
  const projectId = sample?.project_id ?? '';
  const { data: availableTags = [] } = useProjectSampleTags(projectId || undefined);
  const updateSample = useUpdateSample(sampleId, projectId);

  // suppress unused warning for artifact unused in this read-only view
  const [_artifactDetail, setArtifactDetail] = useState<Artifact | null>(null);
  void setArtifactDetail;

  if (isLoading) return <LoadingState message="Loading sample dashboard…" />;
  if (isError || !sample) return <ErrorState message="Failed to load sample." />;

  const assignedTags = sampleDisplayTags(sample);

  const toggleTag = (label: string) => {
    const next = assignedTags.includes(label)
      ? assignedTags.filter(t => t !== label)
      : [...assignedTags, label];
    void updateSample.mutateAsync({ tags: next });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '3px 10px 3px 4px', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--ember)', letterSpacing: '-0.01em' }}>
            {sample.identifier}
          </span>
          {assignedTags.map(label => (
            <span key={label} className="pill">{label}</span>
          ))}
          <StatusPill status={sample.status} />
        </div>
        <IdentifierStrip sample={sample} />
        {sample.description && (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 640 }}>
            {sample.description}
          </p>
        )}
      </div>

      {/* Tag assignment */}
      <div className="section-h"><h2>Tags</h2></div>
      {availableTags.length === 0 ? (
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>
          No project tags yet — add tags from the project Samples tab (Manage tags).
        </p>
      ) : (
        <div className="choice-row" style={{ marginBottom: 20 }}>
          {availableTags.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.label)}
              className={`status-opt${assignedTags.includes(t.label) ? ' sel' : ''}`}
              aria-pressed={assignedTags.includes(t.label)}
              disabled={updateSample.isPending}
            >
              <span className="pill">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Artifact embeds */}
      <SampleArtifactEmbeds sampleId={sampleId} />

      {/* Linked experiments */}
      <LinkedExperimentsSection projectId={sample.project_id} />

      {/* Lineage Graph */}
      <div className="section-h" style={{ marginBottom: 8 }}>
        <h2>Lineage Graph</h2>
      </div>
      <LineageFlow sampleId={sampleId} />
    </div>
  );
}
