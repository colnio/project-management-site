/**
 * TaskReferencePicker — @-search driven reference picker for tasks.
 *
 * Replaces the old checkbox-list approach with a live search input backed by
 * the /v1/search endpoint. Results are grouped by type; clicking a result adds
 * the reference. Current references are shown as removable chips below.
 *
 * Cross-workspace samples/experiments trigger a confirmation dialog before
 * they are added.
 */
import { useState } from 'react';
import { useTaskReferences, useAddReference, useRemoveReference } from '@/hooks/useTaskQueries';
import { useProject } from '@/hooks/useQueries';
import { useMentionSearch, type SearchResult } from '@/hooks/useMentionSearch';
import { CrossWorkspaceConfirm } from '@/components/CrossWorkspaceConfirm';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapRefType(type: SearchResult['type']): 'user' | 'project' | 'sample' | 'experiment' {
  if (type === 'people') return 'user';
  if (type === 'project') return 'project';
  if (type === 'sample') return 'sample';
  return 'experiment';
}

const REF_TYPE_ICON: Record<string, string> = {
  sample:     's',
  experiment: 'e',
  page:       '📄',
  user:       '@',
  project:    '◆',
};

// ─── TaskReferencePicker ──────────────────────────────────────────────────────

interface TaskReferencePickerProps {
  taskId: string;
  projectId: string;
}

export function TaskReferencePicker({ taskId, projectId }: TaskReferencePickerProps) {
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Cross-workspace confirm state
  interface PendingAdd {
    result: SearchResult;
  }
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  const { data: refs = [] } = useTaskReferences(taskId);
  const { data: project } = useProject(projectId);
  const currentWorkspaceId = project?.workspace_id;

  const addRef = useAddReference(taskId);
  const removeRef = useRemoveReference(taskId);

  const { data: searchResults = [], isFetching } = useMentionSearch(query, { projectId });

  const handleAddResult = (result: SearchResult) => {
    const isCrossWorkspace =
      (result.type === 'sample' || result.type === 'experiment') &&
      !!result.workspace_id &&
      !!currentWorkspaceId &&
      result.workspace_id !== currentWorkspaceId;

    if (isCrossWorkspace) {
      setPendingAdd({ result });
      return;
    }
    doAdd(result);
  };

  const doAdd = (result: SearchResult) => {
    addRef.mutate({
      ref_type: mapRefType(result.type),
      ref_id: result.id,
      label: result.label,
    });
    setQuery('');
    setDropdownOpen(false);
  };

  const isBusy = addRef.isPending || removeRef.isPending;

  // Group search results by type
  const groups: Array<{ title: string; items: SearchResult[] }> = [];
  const people = searchResults.filter(r => r.type === 'people');
  const samples = searchResults.filter(r => r.type === 'sample');
  const experiments = searchResults.filter(r => r.type === 'experiment');
  const projects = searchResults.filter(r => r.type === 'project');
  if (people.length)      groups.push({ title: 'People',      items: people });
  if (samples.length)     groups.push({ title: 'Samples',     items: samples });
  if (experiments.length) groups.push({ title: 'Experiments', items: experiments });
  if (projects.length)    groups.push({ title: 'Projects',    items: projects });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => { if (query.length >= 1) setDropdownOpen(true); }}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          placeholder="@search samples, experiments, people, projects…"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '7px 10px',
            border: '1px solid var(--line-2)',
            borderRadius: 7,
            background: 'var(--paper-2)',
            color: 'var(--ink)',
            fontSize: 12.5,
            fontFamily: 'var(--sans)',
            outline: 'none',
          }}
        />
        {isFetching && (
          <span
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: '2px solid var(--line)',
              borderTopColor: 'var(--ember)',
              animation: 'spin 0.8s linear infinite',
              display: 'inline-block',
            }}
          />
        )}

        {/* Dropdown */}
        {dropdownOpen && groups.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 3,
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: 8,
              boxShadow: '0 8px 28px rgba(20,18,14,0.14)',
              zIndex: 300,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {groups.map(group => (
              <div key={group.title}>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--muted-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    padding: '7px 10px 4px',
                  }}
                >
                  {group.title}
                </div>
                {group.items.map(result => (
                  <button
                    key={result.id}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      handleAddResult(result);
                    }}
                    disabled={isBusy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '7px 10px',
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 12.5,
                      color: 'var(--ink)',
                    }}
                  >
                    <span style={{ fontFamily: result.type === 'sample' || result.type === 'experiment' ? 'var(--serif)' : undefined, fontStyle: result.type === 'sample' || result.type === 'experiment' ? 'italic' : undefined, fontSize: 12, color: 'var(--muted)', flexShrink: 0, width: 14, textAlign: 'center' }}>
                      {REF_TYPE_ICON[mapRefType(result.type)] ?? '·'}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.label}
                    </span>
                    {result.sublabel && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {result.sublabel}
                      </span>
                    )}
                    {result.workspace_name && result.tier > 0 && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)', background: 'var(--paper-2)', border: '1px solid var(--line)', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>
                        {result.workspace_name}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current references as chips */}
      {refs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {refs.map(ref => (
            <div
              key={ref.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px 3px 7px',
                background: 'var(--paper-2)',
                border: '1px solid var(--line-2)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--ink)',
                maxWidth: 240,
              }}
            >
              <span style={{ fontFamily: ref.ref_type === 'sample' || ref.ref_type === 'experiment' ? 'var(--serif)' : undefined, fontStyle: ref.ref_type === 'sample' || ref.ref_type === 'experiment' ? 'italic' : undefined, fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>
                {REF_TYPE_ICON[ref.ref_type] ?? '·'}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {ref.label || ref.ref_id.slice(0, 8)}
              </span>
              <button
                type="button"
                onClick={() =>
                  removeRef.mutate({ ref_type: ref.ref_type as Parameters<typeof removeRef.mutate>[0]['ref_type'], ref_id: ref.ref_id })
                }
                disabled={isBusy}
                style={{
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--muted-2)',
                  fontSize: 11,
                  padding: '0 1px',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {refs.length === 0 && query.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)' }}>
          Type to search references.
        </div>
      )}

      {/* Cross-workspace confirm */}
      {pendingAdd && (
        <CrossWorkspaceConfirm
          open={true}
          entityType={pendingAdd.result.type}
          entityLabel={pendingAdd.result.label}
          workspaceName={pendingAdd.result.workspace_name ?? ''}
          onConfirm={() => {
            doAdd(pendingAdd.result);
            setPendingAdd(null);
          }}
          onCancel={() => setPendingAdd(null)}
        />
      )}
    </div>
  );
}
