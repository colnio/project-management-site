import { useState, useEffect, useCallback } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces, useProjects } from '@/hooks/useQueries';
import { useInbox } from '@/hooks/useWorkspaceQueries';
import { useProjectPages } from '@/hooks/usePageQueries';
import { Avatar } from './Avatar';
import { CommandPalette } from './CommandPalette';
import { ThemeToggle } from './ThemeToggle';
import type { Workspace, Project } from '@/api/types';
import { isPrivileged } from '@/api/types';
import type { ReactNode } from 'react';

const LS_WS_KEY = 'currentWorkspaceId';

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

function CalendarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7H14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 1.5V4.5M10.5 1.5V4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5.5" cy="10" r="1" fill="currentColor" />
      <circle cx="8" cy="10" r="1" fill="currentColor" />
      <circle cx="10.5" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function SettingsIcon({ size = 13 }: { size?: number }) {
  // Toothed cog (not radiating spokes) so it can't be mistaken for the sun/theme toggle.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InboxIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 10H5.5L6.5 12H9.5L10.5 10H14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 13C1.5 10.5 3.5 8.5 6 8.5C8.5 8.5 10.5 10.5 10.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 7.5C12.7 7.5 14 8.8 14 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11.5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function MeetingsIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5V8.5L10.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AdminIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 2L10 6L14.5 6.5L11 9.5L12 14L8 11.5L4 14L5 9.5L1.5 6.5L6 6L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function TemplatesIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function NotesIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 2H11L13 4V14H3V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 2V4H13" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5.5 7H10.5M5.5 10H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── ProjectNotesTree ─────────────────────────────────────────────────────────
// One instance per expanded project. Calls useProjectPages once (no hook-in-loop).

interface ProjectNotesTreeProps {
  projectId: string;
}

function ProjectNotesTree({ projectId }: ProjectNotesTreeProps) {
  const router = useRouter();
  const { data: pages = [], isLoading } = useProjectPages(projectId);

  if (isLoading) {
    return (
      <div className="tree-item" style={{ paddingLeft: 28, color: 'var(--muted-2)', fontStyle: 'italic', fontSize: 11 }}>
        Loading…
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="tree-item" style={{ paddingLeft: 28, color: 'var(--muted-2)', fontStyle: 'italic', fontSize: 11 }}>
        No notes yet
      </div>
    );
  }

  return (
    <>
      {pages.map(page => (
        <button
          key={page.id}
          className="tree-item"
          onClick={() => void router.navigate({ to: '/pages/$pageId', params: { pageId: page.id } })}
          style={{ paddingLeft: 28 }}
        >
          <span className="dot" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
            {page.title || 'Untitled'}
          </span>
        </button>
      ))}
    </>
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
  inboxCount?: number;
}

function Sidebar({
  activeWorkspaceId,
  activeProjectId,
  workspaces,
  projects,
  onSelectWorkspace,
  onOpenPalette,
  inboxCount = 0,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(activeProjectId ? [activeProjectId] : [])
  );
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
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

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => {
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
          <div className="ws-name">{activeWorkspace?.name ?? 'Graphene Lab'}</div>
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
        <Link
          to="/inbox"
          className="side-item"
          activeProps={{ className: 'side-item active' }}
        >
          <span className="ic">
            <InboxIcon size={13} />
          </span>
          Inbox
          {inboxCount > 0 && (
            <span className="count">{inboxCount > 99 ? '99+' : inboxCount}</span>
          )}
        </Link>
        <Link
          to="/meetings"
          className="side-item"
          activeProps={{ className: 'side-item active' }}
        >
          <span className="ic">
            <MeetingsIcon size={13} />
          </span>
          Meetings
        </Link>
        <Link
          to="/people"
          className="side-item"
          activeProps={{ className: 'side-item active' }}
        >
          <span className="ic">
            <PeopleIcon size={13} />
          </span>
          People
        </Link>
        <Link
          to="/calendar"
          className="side-item"
          activeProps={{ className: 'side-item active' }}
        >
          <span className="ic">
            <CalendarIcon size={13} />
          </span>
          Calendar
        </Link>
        {isPrivileged(user) && (
          <Link
            to="/admin"
            className="side-item"
            activeProps={{ className: 'side-item active' }}
          >
            <span className="ic">
              <AdminIcon size={13} />
            </span>
            Admin
          </Link>
        )}
      </nav>

      {/* Templates section */}
      <div className="side-sect">
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <TemplatesIcon size={11} />
          Templates
        </span>
      </div>
      <div style={{ padding: '0 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[
          { key: 'battery_safety_risk_v1', label: 'Battery Safety Risk' },
          { key: 'experimental_risk_v1', label: 'Experimental Risk' },
          { key: 'project_risk_v1', label: 'Project Risk' },
        ].map(tpl => (
          <Link
            key={tpl.key}
            to="/templates/$workflowKey"
            params={{ workflowKey: tpl.key }}
            className="side-item"
            activeProps={{ className: 'side-item active' }}
          >
            <span className="ic" style={{ color: 'var(--muted-2)' }}>·</span>
            {tpl.label}
          </Link>
        ))}
      </div>

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

                  {/* Notes / Pages group */}
                  <button
                    className="tree-item"
                    onClick={() => toggleNotes(p.id)}
                  >
                    <span className="chev">
                      {expandedNotes.has(p.id) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </span>
                    <span className="ic" style={{ color: 'var(--muted-2)' }}>
                      <NotesIcon size={12} />
                    </span>
                    Notes
                  </button>

                  {expandedNotes.has(p.id) && (
                    <ProjectNotesTree projectId={p.id} />
                  )}
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <ThemeToggle />
          <Link to="/settings" className="icon-btn" title="Settings">
            <SettingsIcon size={13} />
          </Link>
          <button
            className="icon-btn"
            onClick={() => void logout()}
            title="Logout"
          >
            <LogoutIcon size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  title: string;
  crumbs?: Array<{ label: string; href?: string }>;
  actions?: ReactNode;
}

function TopBar({ title, crumbs = [], actions }: TopBarProps) {
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
      <div className="top-actions">{actions}</div>
    </header>
  );
}

// ─── AppShell (layout wrapper) ────────────────────────────────────────────────

interface AppShellProps {
  children: ReactNode;
  activeProjectId?: string;
  topBarCrumbs?: Array<{ label: string; href?: string }>;
  topBarActions?: ReactNode;
}

export function AppShell({ children, activeProjectId, topBarCrumbs = [], topBarActions }: AppShellProps) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: workspaces = [] } = useWorkspaces();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>(() => {
    return localStorage.getItem(LS_WS_KEY) ?? undefined;
  });

  // Pick first workspace by default or validate stored id
  useEffect(() => {
    if (workspaces.length === 0) return;
    const stored = localStorage.getItem(LS_WS_KEY);
    if (stored && workspaces.some(w => w.id === stored)) {
      setActiveWorkspaceId(stored);
    } else {
      const first = workspaces[0].id;
      localStorage.setItem(LS_WS_KEY, first);
      setActiveWorkspaceId(first);
    }
  }, [workspaces]);

  const { data: inboxItems = [] } = useInbox(activeWorkspaceId);

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
      localStorage.setItem(LS_WS_KEY, workspaceId);
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
          localStorage.setItem(LS_WS_KEY, id);
          setActiveWorkspaceId(id);
          void router.navigate({ to: '/workspaces' });
        }}
        onOpenPalette={() => setPaletteOpen(true)}
        inboxCount={inboxItems.length}
      />

      <div className="main">
        <TopBar title="" crumbs={topBarCrumbs} actions={topBarActions} />
        <div className="content">{children}</div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projects={projects}
        workspaces={workspaces}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onSelectWorkspace={handleSelectWorkspace}
      />

    </div>
  );
}
