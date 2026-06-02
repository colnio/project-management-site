/**
 * HomePage — dashboard: greeting, project grid, PI-review panel, activity feed.
 */
import { useAuth } from '@/hooks/useAuth';
import {
  useWorkspaces,
  useProjects,
  useCurrentWorkspace,
} from '@/hooks/useQueries';
import { useInbox } from '@/hooks/useWorkspaceQueries';
import { AppShell } from '@/components/AppShell';
import { LoadingState, EmptyState } from '@/components/LoadingState';
import { Link } from '@tanstack/react-router';
import type { Project } from '@/api/types';
import type { InboxItem } from '@/hooks/useWorkspaceQueries';
import { safeAppPath } from '@/lib/safeAppPath';
import { ApiError } from '@/api/client';

/** Returns true when the react-query error is an HTTP 403 Forbidden. */
function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const visIcon = project.visibility === 'private' ? '🔒' : '🌐';

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 10,
          background: 'var(--surface)',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          cursor: 'pointer',
          transition: 'box-shadow 0.15s, border-color 0.15s',
          minHeight: 120,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--line-2)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--line)';
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 7,
              background: 'var(--ink)',
              color: 'var(--paper)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              fontFamily: 'var(--serif)',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {project.name[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: 'var(--ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {project.name}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                color: 'var(--muted-2)',
                marginTop: 2,
              }}
            >
              {visIcon} {project.visibility}
            </div>
          </div>
        </div>

        {/* Description */}
        {project.description ? (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--muted)',
              lineHeight: 1.45,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              textOverflow: 'ellipsis',
            }}
          >
            {project.description}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--muted-2)', fontStyle: 'italic' }}>
            No description.
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 'auto',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--muted-2)',
          }}
        >
          Updated {relativeTime(project.updated_at)}
        </div>
      </div>
    </Link>
  );
}

// ─── Project Grid ─────────────────────────────────────────────────────────────

function ProjectGrid({ workspaceId }: { workspaceId: string }) {
  const { data: projects = [], isLoading } = useProjects(workspaceId);

  if (isLoading) return <LoadingState message="Loading projects…" />;
  if (projects.length === 0) {
    return (
      <EmptyState message="No projects in this workspace yet." />
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 14,
      }}
    >
      {projects.map((p: Project) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}

// ─── Risk / PI-flag panel ─────────────────────────────────────────────────────

function RiskApprovalPanel({ workspaceId }: { workspaceId: string }) {
  const { data: inbox = [], isLoading, isError, error } = useInbox(workspaceId);

  const piFlags = inbox.filter((item: InboxItem) => item.kind === 'pi_flag');

  if (isLoading) {
    return (
      <div style={{ padding: '14px 0', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>
        Loading…
      </div>
    );
  }

  if (isError) {
    if (isForbidden(error)) {
      return (
        <EmptyState message="Join a workspace to see your inbox." />
      );
    }
    return (
      <div style={{ padding: '10px 0', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)' }}>
        Could not load inbox.
      </div>
    );
  }

  if (piFlags.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 0',
        }}
      >
        <span style={{ fontSize: 18, opacity: 0.7 }}>✓</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--good)' }}>
          All clear — no risks pending PI review.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {piFlags.map((item: InboxItem) => {
        const reviewPath = safeAppPath(item.link);
        return (
        <div
          key={item.id}
          style={{
            border: '1px solid var(--pill-blocked-bd)',
            background: 'var(--pill-blocked-bg)',
            borderRadius: 7,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--bad)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 500,
                fontSize: 13,
                color: 'var(--ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.title}
            </div>
            {item.body && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                {item.body.slice(0, 100)}{item.body.length > 100 ? '…' : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {reviewPath && (
              <Link
                to={reviewPath}
                style={{ textDecoration: 'none' }}
              >
                <button className="top-btn primary" style={{ fontSize: 11, padding: '3px 10px' }}>
                  Review
                </button>
              </Link>
            )}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)', alignSelf: 'center' }}>
              {relativeTime(item.created_at)}
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

const KIND_ICON: Record<string, string> = {
  pi_flag: '⚑',
  ai_proposal: '✦',
  action_item: '◎',
  comment: '◷',
  system: '◈',
  mention: '@',
};

const KIND_COLOR: Record<string, string> = {
  pi_flag: 'var(--bad)',
  ai_proposal: 'var(--ember)',
  action_item: 'var(--info)',
  comment: 'var(--muted)',
  system: 'var(--muted-2)',
  mention: 'var(--ember)',
};

function ActivityFeed({ workspaceId }: { workspaceId: string }) {
  const { data: inbox = [], isLoading, isError, error } = useInbox(workspaceId);

  // Show non-pi_flag items as activity
  const feedItems = inbox
    .filter((item: InboxItem) => item.kind !== 'pi_flag')
    .slice(0, 10);

  if (isLoading) {
    return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>
        Loading…
      </div>
    );
  }

  if (isError) {
    if (isForbidden(error)) {
      return (
        <EmptyState message="No lab activity yet." />
      );
    }
    return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)', padding: '10px 0' }}>
        Activity feed unavailable.
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-2)', padding: '12px 0' }}>
        No recent activity.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {feedItems.map((item: InboxItem, idx: number) => {
        const icon = KIND_ICON[item.kind] ?? '·';
        const color = KIND_COLOR[item.kind] ?? 'var(--muted)';
        const isLast = idx === feedItems.length - 1;

        return (
          <div
            key={item.id}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              paddingBottom: isLast ? 0 : 12,
              marginBottom: isLast ? 0 : 12,
              borderBottom: isLast ? 'none' : '1px solid var(--line)',
            }}
          >
            {/* Icon + timeline stem */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 20 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: `${color}18`,
                  border: `1.5px solid ${color}`,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 9,
                  color,
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
              {!isLast && (
                <div
                  style={{
                    width: 1,
                    flex: 1,
                    background: 'var(--line)',
                    marginTop: 4,
                    minHeight: 12,
                  }}
                />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.title}
              </div>
              {item.body && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--muted)',
                    marginTop: 2,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.body}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9.5,
                    color,
                    background: `${color}14`,
                    padding: '0 5px',
                    borderRadius: 3,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {item.kind.replace('_', ' ')}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)' }}>
                  {relativeTime(item.created_at)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dashboard panel wrapper ──────────────────────────────────────────────────

function DashPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--paper-2)',
          fontFamily: 'var(--sans)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-2)',
        }}
      >
        {title}
      </div>
      <div style={{ padding: '16px 18px', background: 'var(--surface)' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Workspace chip / switcher ────────────────────────────────────────────────

function WorkspaceChip() {
  const { workspaceId, setWorkspaceId } = useCurrentWorkspace();
  const { data: workspaces = [] } = useWorkspaces();
  const current = workspaces.find(w => w.id === workspaceId);

  if (workspaces.length <= 1) {
    return current ? (
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--muted)',
          background: 'var(--paper-2)',
          border: '1px solid var(--line)',
          borderRadius: 20,
          padding: '3px 10px',
        }}
      >
        {current.name}
      </span>
    ) : null;
  }

  return (
    <select
      className="field-input"
      style={{
        width: 'auto',
        padding: '3px 10px',
        fontSize: 12,
        fontFamily: 'var(--mono)',
        borderRadius: 20,
        minWidth: 140,
      }}
      value={workspaceId ?? ''}
      onChange={e => setWorkspaceId(e.target.value)}
    >
      {workspaces.map(w => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}

// ─── Workspace row (label + chip, hidden when user has no workspace) ──────────

function WorkspaceRow() {
  const { workspaceId } = useCurrentWorkspace();
  const { data: workspaces = [] } = useWorkspaces();
  const hasWorkspace = workspaces.length > 0 && !!workspaceId;

  if (!hasWorkspace) {
    return (
      <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)' }}>
        Join or create a workspace to get started.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
      <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>
        Workspace:
      </div>
      <WorkspaceChip />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function HomePage() {
  const { user } = useAuth();
  const { workspaceId } = useCurrentWorkspace();

  const crumbs = [{ label: 'Home' }];

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap wide">

        {/* ── Greeting header ───────────────────────────────────────────── */}
        <div style={{ paddingTop: 8, paddingBottom: 28 }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted)',
              letterSpacing: '.05em',
              textTransform: 'uppercase',
            }}
          >
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <h1
            style={{
              fontFamily: 'Libre Baskerville, serif',
              fontSize: 40,
              letterSpacing: '-.015em',
              margin: '4px 0 8px',
              fontWeight: 400,
              lineHeight: 1.1,
              color: 'var(--ink)',
            }}
          >
            {greeting()},{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--muted)' }}>
              {user?.display_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'researcher'}.
            </em>
          </h1>
          <WorkspaceRow />
        </div>

        {/* ── Project grid ─────────────────────────────────────────────── */}
        <div className="section-h" style={{ marginBottom: 14 }}>
          <h2>Projects</h2>
        </div>
        {workspaceId ? (
          <ProjectGrid workspaceId={workspaceId} />
        ) : (
          <LoadingState message="Loading workspace…" />
        )}

        {/* ── Bottom two-col dashboard ──────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 18,
            marginTop: 28,
          }}
        >
          {/* PI Review panel */}
          <DashPanel title="PI Review — Flagged Risks">
            {workspaceId ? (
              <RiskApprovalPanel workspaceId={workspaceId} />
            ) : (
              <LoadingState message="Loading…" />
            )}
          </DashPanel>

          {/* Activity feed */}
          <DashPanel title="Lab Activity">
            {workspaceId ? (
              <ActivityFeed workspaceId={workspaceId} />
            ) : (
              <LoadingState message="Loading…" />
            )}
          </DashPanel>
        </div>
      </div>
    </AppShell>
  );
}
