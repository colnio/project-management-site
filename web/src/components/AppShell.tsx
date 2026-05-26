import { useState, useEffect, useCallback } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces, useProjects } from '@/hooks/useQueries';
import { Avatar } from './Avatar';
import { CommandPalette } from './CommandPalette';
import type { Workspace, Project } from '@/api/types';
import type { ReactNode } from 'react';

// ─── Icons ───────────────────────────────────────────────────────────────────

function ChevronRight({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
      <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDown({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 8L8 2L14 8V14H10V10H6V14H2V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 5H12.5C13.33 5 14 5.67 14 6.5V12C14 12.83 13.33 13.5 12.5 13.5H3.5C2.67 13.5 2 12.83 2 12V4.5Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function LockIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7V5C5 3.34 6.34 2 8 2C9.66 2 11 3.34 11 5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M6 3H3C2.45 3 2 3.45 2 4V12C2 12.55 2.45 13 3 13H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 5L13 8L10 11M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  activeWorkspaceId: string | undefined;
  activeProjectId: string | undefined;
  workspaces: Workspace[];
  projects: Project[];
  onSelectWorkspace: (id: string) => void;
  onOpenPalette: () => void;
}

function Sidebar({
  activeWorkspaceId,
  activeProjectId,
  workspaces,
  projects,
  onSelectWorkspace,
  onOpenPalette,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(activeProjectId ? [activeProjectId] : [])
  );
  const [wsSwitcherOpen, setWsSwitcherOpen] = useState(false);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const SUB_TABS = ['overview', 'iterations', 'samples', 'experiments', 'artifacts'] as const;

  return (
    <aside className="side">
      {/* Workspace header */}
      <div className="side-head" style={{ position: 'relative' }}>
        <div
          className="ws-badge"
          style={{ cursor: 'default' }}
        >
          {activeWorkspace?.name[0]?.toUpperCase() ?? 'H'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="ws-name">{activeWorkspace?.name ?? 'Halide Lab'}</div>
          <div className="ws-sub">{activeWorkspace?.slug ?? 'workspace'}</div>
        </div>
        <button
          className="ws-pick"
          onClick={() => setWsSwitcherOpen(o => !o)}
          title="Switch workspace"
        >
          <ChevronDown size={12} />
        </button>

        {/* Workspace dropdown */}
        {wsSwitcherOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 8,
              right: 8,
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(20,18,14,0.12)',
              zIndex: 50,
              padding: '4px 0',
              marginTop: 4,
            }}
          >
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => {
                  onSelectWorkspace(ws.id);
                  setWsSwitcherOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '7px 12px',
                  background: ws.id === activeWorkspaceId ? 'var(--paper-2)' : 'transparent',
                  border: 0,
                  cursor: 'default',
                  fontSize: 13,
                  color: 'var(--ink)',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {ws.name[0]?.toUpperCase()}
                </span>
                {ws.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search / ⌘K */}
      <div
        className="side-search"
        onClick={onOpenPalette}
        style={{ cursor: 'default' }}
      >
        <SearchIcon size={13} />
        <span>Search or jump to…</span>
        <span className="kbd">⌘K</span>
      </div>

      {/* Nav */}
      <nav className="side-nav">
        <Link
          to="/"
          className="side-item"
          activeProps={{ className: 'side-item active' }}
          activeOptions={{ exact: true }}
        >
          <span className="ic">
            <HomeIcon size={13} />
          </span>
          Home
        </Link>
        <Link
          to="/workspaces"
          className="side-item"
          activeProps={{ className: 'side-item active' }}
        >
          <span className="ic">
            <FolderIcon size={13} />
          </span>
          Workspaces
        </Link>
      </nav>

      {/* Projects section */}
      <div className="side-sect">
        <span>Projects</span>
        <Link to="/workspaces" className="add" title="New project">
          ＋
        </Link>
      </div>
      <div className="side-tree" style={{ overflowY: 'auto', flex: '1 1 auto' }}>
        {projects.map(p => {
          const isActive = p.id === activeProjectId;
          const isExpanded = expandedProjects.has(p.id);

          return (
            <div key={p.id}>
              <button
                className={`tree-item${isActive ? ' active' : ''}`}
                onClick={() => {
                  toggleProject(p.id);
                  void router.navigate({ to: '/projects/$projectId', params: { projectId: p.id } });
                }}
              >
                <span className="chev" onClick={(e) => { e.stopPropagation(); toggleProject(p.id); }}>
                  {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </span>
                <span className="glyph">{p.name[0]?.toUpperCase()}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                {p.visibility === 'private' && (
                  <span style={{ marginLeft: 'auto', color: 'var(--muted-2)' }}>
                    <LockIcon size={11} />
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="tree-children">
                  {SUB_TABS.map(tab => (
                    <Link
                      key={tab}
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      search={{ tab }}
                      className="tree-item"
                      activeProps={{ className: 'tree-item active' }}
                    >
                      <span style={{ width: 10 }} />
                      <span className="dot" />
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="side-foot">
        {user && <Avatar name={user.display_name || user.email} size={24} />}
        <div style={{ minWidth: 0 }}>
          <div className="me-name">{user?.display_name || user?.email}</div>
          <div className="me-sub">{user?.email}</div>
        </div>
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => void logout()}
          title="Logout"
        >
          <LogoutIcon size={14} />
        </button>
      </div>
    </aside>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  title: string;
  crumbs?: Array<{ label: string; href?: string }>;
}

function TopBar({ title, crumbs = [] }: TopBarProps) {
  void title; // used via crumbs
  return (
    <header className="top">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {c.href ? (
              <Link to={c.href} style={{ color: 'var(--muted)', cursor: 'default' }}>
                {c.label}
              </Link>
            ) : (
              <span className="cur">{c.label}</span>
            )}
            {i < crumbs.length - 1 && <span className="sep">/</span>}
          </span>
        ))}
      </div>
      <div className="top-actions" />
    </header>
  );
}

// ─── AppShell (layout wrapper) ────────────────────────────────────────────────

interface AppShellProps {
  children: ReactNode;
  activeProjectId?: string;
  topBarCrumbs?: Array<{ label: string; href?: string }>;
}

export function AppShell({ children, activeProjectId, topBarCrumbs = [] }: AppShellProps) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: workspaces = [] } = useWorkspaces();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();

  // Pick first workspace by default
  useEffect(() => {
    if (workspaces.length > 0 && !activeWorkspaceId) {
      setActiveWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, activeWorkspaceId]);

  const { data: projects = [] } = useProjects(activeWorkspaceId);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelectProject = useCallback(
    (projectId: string, workspaceId: string) => {
      setActiveWorkspaceId(workspaceId);
      void router.navigate({ to: '/projects/$projectId', params: { projectId } });
    },
    [router]
  );

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      setActiveWorkspaceId(workspaceId);
      void router.navigate({ to: '/workspaces' });
    },
    [router]
  );

  return (
    <div className="app no-ai">
      <Sidebar
        activeWorkspaceId={activeWorkspaceId}
        activeProjectId={activeProjectId}
        workspaces={workspaces}
        projects={projects}
        onSelectWorkspace={(id) => {
          setActiveWorkspaceId(id);
          void router.navigate({ to: '/workspaces' });
        }}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="main">
        <TopBar title="" crumbs={topBarCrumbs} />
        <div className="content">{children}</div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projects={projects}
        workspaces={workspaces}
        onSelectProject={handleSelectProject}
        onSelectWorkspace={handleSelectWorkspace}
      />
    </div>
  );
}
