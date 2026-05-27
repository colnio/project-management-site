import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { Project, Workspace, Sample, Experiment } from '@/api/types';
import { useProjectSamples, useProjectExperiments } from '@/hooks/useQueries';
import { useProjectPages, type PageListItem } from '@/hooks/usePageQueries';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  workspaces: Workspace[];
  activeProjectId?: string;
  onSelectProject: (projectId: string, workspaceId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
}

interface PaletteItem {
  id: string;
  label: string;
  sub?: string;
  kind: 'project' | 'workspace' | 'sample' | 'experiment' | 'page';
  data: Project | Workspace | Sample | Experiment | PageListItem;
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette({
  open,
  onClose,
  projects,
  workspaces,
  activeProjectId,
  onSelectProject,
  onSelectWorkspace,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Index the active project's samples, experiments, and pages
  const { data: activeSamples = [] } = useProjectSamples(activeProjectId);
  const { data: activeExperiments = [] } = useProjectExperiments(activeProjectId);
  const { data: activePages = [] } = useProjectPages(activeProjectId);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const items: PaletteItem[] = [
    ...workspaces.map(w => ({
      id: `ws-${w.id}`,
      label: w.name,
      sub: 'Workspace',
      kind: 'workspace' as const,
      data: w,
    })),
    ...projects.map(p => ({
      id: `proj-${p.id}`,
      label: p.name,
      sub: p.description || 'Project',
      kind: 'project' as const,
      data: p,
    })),
    ...activeSamples.map(s => ({
      id: `smp-${s.id}`,
      label: s.name || s.identifier || s.id.slice(0, 8),
      sub: activeProject ? `Sample · ${activeProject.name}` : 'Sample',
      kind: 'sample' as const,
      data: s,
    })),
    ...activeExperiments.map(e => ({
      id: `exp-${e.id}`,
      label: e.code ?? e.result_summary?.slice(0, 40) ?? e.id.slice(0, 8),
      sub: activeProject ? `Experiment · ${activeProject.name}` : 'Experiment',
      kind: 'experiment' as const,
      data: e,
    })),
    ...activePages.map(pg => ({
      id: `pg-${pg.id}`,
      label: pg.title || 'Untitled page',
      sub: activeProject ? `Page · ${activeProject.name}` : 'Page',
      kind: 'page' as const,
      data: pg,
    })),
  ].filter(item => fuzzyMatch(query, item.label));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && items[selected]) {
      handleSelect(items[selected]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleSelect = (item: PaletteItem) => {
    switch (item.kind) {
      case 'project': {
        const p = item.data as Project;
        onSelectProject(p.id, p.workspace_id);
        break;
      }
      case 'workspace': {
        const w = item.data as Workspace;
        onSelectWorkspace(w.id);
        break;
      }
      case 'sample': {
        const s = item.data as Sample;
        void navigate({ to: '/samples/$sampleId', params: { sampleId: s.id } });
        break;
      }
      case 'experiment': {
        const exp = item.data as Experiment;
        void navigate({ to: '/experiments/$experimentId', params: { experimentId: exp.id } });
        break;
      }
      case 'page': {
        const pg = item.data as PageListItem;
        void navigate({ to: '/pages/$pageId', params: { pageId: pg.id } });
        break;
      }
    }
    onClose();
  };

  // Kind → badge colour config
  const kindStyle: Record<PaletteItem['kind'], { bg: string; color: string; radius: number }> = {
    workspace: { bg: 'var(--ink)', color: 'var(--paper)', radius: 7 },
    project: { bg: 'var(--ember-tint)', color: 'var(--ember)', radius: 6 },
    sample: { bg: 'var(--teal-tint, #e6f4f1)', color: 'var(--teal, #2a7a6a)', radius: 5 },
    experiment: { bg: 'var(--violet-tint, #ede9f7)', color: 'var(--violet, #5b3fa8)', radius: 5 },
    page: { bg: 'var(--paper-2)', color: 'var(--muted)', radius: 5 },
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.25)',
          zIndex: 100,
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Dialog */}
      <div
        style={{
          position: 'fixed',
          top: '20vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--surface)',
          border: '1px solid var(--line-2)',
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(20,18,14,0.2), 0 4px 12px rgba(20,18,14,0.1)',
          zIndex: 101,
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--muted)', flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to project, sample, experiment, page…"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: 'transparent',
              font: '14px/1.5 var(--sans)',
              color: 'var(--ink)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted-2)',
              background: 'var(--paper-2)',
              border: '1px solid var(--line)',
              padding: '1px 5px',
              borderRadius: 4,
            }}
          >
            esc
          </span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
          {items.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                color: 'var(--muted)',
                fontFamily: 'var(--mono)',
                fontSize: 12.5,
                textAlign: 'center',
              }}
            >
              No results for "{query}"
            </div>
          ) : (
            items.map((item, i) => {
              const ks = kindStyle[item.kind];
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '9px 16px',
                    background: i === selected ? 'var(--paper-2)' : 'transparent',
                    border: 0,
                    cursor: 'default',
                    textAlign: 'left',
                  }}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: ks.radius,
                      background: ks.bg,
                      color: ks.color,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      fontWeight: 600,
                      flexShrink: 0,
                      border: item.kind === 'project' ? '1px solid var(--ember-soft)' : 'none',
                    }}
                  >
                    {item.label[0]?.toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                    {item.sub && (
                      <span
                        style={{
                          display: 'block',
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          color: 'var(--muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: 1,
                        }}
                      >
                        {item.sub}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      color: 'var(--muted-2)',
                      background: 'var(--paper-2)',
                      border: '1px solid var(--line)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {item.kind}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid var(--line)',
            padding: '7px 16px',
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted-2)',
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </>
  );
}
