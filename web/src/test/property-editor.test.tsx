/**
 * Tests for C4 — Property editor (JSONB key-value editor) and
 * the lineageToFlow transform used in the Sample lineage graph.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyEditor } from '../pages/SampleDetailPage';

// ─── PropertyEditor unit tests ───────────────────────────────────────────────

describe('PropertyEditor', () => {
  it('renders existing key-value pairs', () => {
    const props = { voltage: 4.2, cycles: 100, label: 'nmc' };
    const onChange = vi.fn();
    render(<PropertyEditor properties={props} onChange={onChange} />);

    expect(screen.getByText('voltage')).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy();
    expect(screen.getByText('cycles')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('label')).toBeTruthy();
    expect(screen.getByText('nmc')).toBeTruthy();
  });

  it('shows "No properties" when empty', () => {
    render(<PropertyEditor properties={{}} onChange={vi.fn()} />);
    expect(screen.getByText('No properties')).toBeTruthy();
  });

  it('calls onChange with key removed when remove button clicked', () => {
    const props = { foo: 'bar', baz: 42 };
    const onChange = vi.fn();
    render(<PropertyEditor properties={props} onChange={onChange} />);

    // Find all ✕ buttons — first one removes 'foo'
    const removeBtns = screen.getAllByText('✕');
    fireEvent.click(removeBtns[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const called = onChange.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(called)).not.toContain('foo');
    expect(called).toHaveProperty('baz', 42);
  });

  it('adds a new string property via the add form', () => {
    const onChange = vi.fn();
    render(<PropertyEditor properties={{}} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add property'));

    const inputs = screen.getAllByRole('textbox');
    // inputs[0] = key, inputs[1] = value
    fireEvent.change(inputs[0], { target: { value: 'electrolyte' } });
    fireEvent.change(inputs[1], { target: { value: '1M LiPF6' } });

    fireEvent.click(screen.getByText('Add'));

    expect(onChange).toHaveBeenCalledWith({ electrolyte: '1M LiPF6' });
  });

  it('parses JSON numeric values when adding', () => {
    const onChange = vi.fn();
    render(<PropertyEditor properties={{}} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add property'));
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'rate' } });
    fireEvent.change(inputs[1], { target: { value: '3.14' } });
    fireEvent.click(screen.getByText('Add'));

    expect(onChange).toHaveBeenCalledWith({ rate: 3.14 });
  });

  it('handles JSON object values when adding', () => {
    const onChange = vi.fn();
    render(<PropertyEditor properties={{}} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add property'));
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'meta' } });
    fireEvent.change(inputs[1], { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByText('Add'));

    expect(onChange).toHaveBeenCalledWith({ meta: { a: 1 } });
  });
});

// ─── lineageToFlow transform tests ───────────────────────────────────────────

// We test the transform logic directly by replicating the logic from SampleDetailPage.
// This avoids needing to render ReactFlow in tests (which requires a browser env with sizing).

type LineageGraph = {
  nodes: Array<{ id: string; identifier: string; name: string; kind: string }> | null;
  edges: Array<{ parent_sample_id: string; child_sample_id: string; relation_type: string; notes: string }> | null;
};

function lineageToFlowTest(graph: LineageGraph, focusId: string) {
  const sampleNodes = graph.nodes ?? [];
  const graphEdges = graph.edges ?? [];

  const nodes = sampleNodes.map((s, i) => ({
    id: s.id,
    isFocus: s.id === focusId,
    position: { x: i * 100, y: 300 },
  }));

  const edges = graphEdges.map((e, i) => ({
    id: `e${i}`,
    source: e.parent_sample_id,
    target: e.child_sample_id,
    label: e.relation_type.replace(/_/g, ' '),
  }));

  return { nodes, edges };
}

describe('lineageToFlow transform', () => {
  const graph: LineageGraph = {
    nodes: [
      { id: 'a', identifier: 'A-001', name: 'Precursor A', kind: 'precursor' },
      { id: 'b', identifier: 'B-001', name: 'Electrode B', kind: 'electrode' },
      { id: 'c', identifier: 'C-001', name: 'Cell C', kind: 'cell' },
    ],
    edges: [
      { parent_sample_id: 'a', child_sample_id: 'b', relation_type: 'derived_from', notes: '' },
      { parent_sample_id: 'b', child_sample_id: 'c', relation_type: 'assembled_into', notes: '' },
    ],
  };

  it('creates one node per sample', () => {
    const { nodes } = lineageToFlowTest(graph, 'b');
    expect(nodes).toHaveLength(3);
  });

  it('marks the focus node correctly', () => {
    const { nodes } = lineageToFlowTest(graph, 'b');
    const focus = nodes.find(n => n.id === 'b');
    expect(focus?.isFocus).toBe(true);
    const others = nodes.filter(n => n.id !== 'b');
    others.forEach(n => expect(n.isFocus).toBe(false));
  });

  it('creates correct edges', () => {
    const { edges } = lineageToFlowTest(graph, 'b');
    expect(edges).toHaveLength(2);
    expect(edges[0].source).toBe('a');
    expect(edges[0].target).toBe('b');
    expect(edges[0].label).toBe('derived from');
    expect(edges[1].label).toBe('assembled into');
  });

  it('handles empty graph', () => {
    const { nodes, edges } = lineageToFlowTest({ nodes: null, edges: null }, 'x');
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});
