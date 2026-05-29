/**
 * PeoplePage — /people
 * Workspace members grouped by role. No pending-invites endpoint exists (deviation noted).
 */
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { Avatar } from '@/components/Avatar';
import { useWorkspaceMembers, useCurrentWorkspace } from '@/hooks/useQueries';
import type { MemberView } from '@/hooks/useWorkspaceQueries';

// ─── Role order ───────────────────────────────────────────────────────────────

const ROLE_ORDER = ['owner', 'admin', 'member', 'external'] as const;
type Role = typeof ROLE_ORDER[number];

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owners',
  admin: 'Admins',
  members: 'Members',
  member: 'Members',
  external: 'External',
};

function rolePillStyle(role: string): React.CSSProperties {
  switch (role.toLowerCase()) {
    case 'owner':
      return { background: 'var(--ember-tint)', color: 'var(--ember)', border: '1px solid var(--ember-soft)' };
    case 'admin':
      return { background: 'var(--pill-planned-bg)', color: 'var(--pill-planned-fg)', border: '1px solid var(--pill-planned-bd)' };
    default:
      return { background: 'var(--paper-2)', color: 'var(--muted)', border: '1px solid var(--line)' };
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({ member }: { member: MemberView }) {
  const displayName = member.display_name || member.email;
  return (
    <div
      className="rec"
      style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 14px' }}
    >
      <Avatar name={displayName} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.email}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: 99,
            fontSize: 10.5,
            fontFamily: 'var(--mono)',
            ...rolePillStyle(member.role),
          }}
        >
          {member.role}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)' }}>
          Joined {fmtDate(member.created_at)}
        </span>
      </div>
    </div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function RoleGroup({ role, members }: { role: string; members: MemberView[] }) {
  if (members.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="section-h" style={{ marginTop: 0, marginBottom: 10 }}>
        <h2>{ROLE_LABELS[role] ?? role}</h2>
        <span className="meta">{members.length}</span>
      </div>
      <div className="records">
        {members.map(m => <MemberCard key={m.id} member={m} />)}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PeoplePage() {
  const { workspaceId } = useCurrentWorkspace();
  // useWorkspaceMembers returns Membership[] from schema; we cast defensively
  const { data: members = [], isLoading, isError } = useWorkspaceMembers(workspaceId);

  const crumbs = [{ label: 'People' }];

  const grouped = ROLE_ORDER.reduce<Record<Role, MemberView[]>>((acc, r) => {
    acc[r] = members.filter(m => m.role?.toLowerCase() === r);
    return acc;
  }, { owner: [], admin: [], member: [], external: [] });

  // Catch any role not in our known list
  const uncategorized = members.filter(m => !ROLE_ORDER.includes(m.role?.toLowerCase() as Role));

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: 0 }}>
            People
          </h1>
          {!isLoading && !isError && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)' }}>
              {members.length} member{members.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {isLoading && <LoadingState message="Loading members…" />}
        {isError && <ErrorState message="Failed to load members." />}

        {!isLoading && !isError && members.length === 0 && (
          <EmptyState message="No members in this workspace." />
        )}

        {!isLoading && !isError && members.length > 0 && (
          <>
            {ROLE_ORDER.map(r => (
              <RoleGroup key={r} role={r} members={grouped[r]} />
            ))}
            {uncategorized.length > 0 && (
              <RoleGroup role="member" members={uncategorized} />
            )}
          </>
        )}

        {/* Pending invites: no list-pending-invites endpoint exists — omitted (deviation). */}
      </div>
    </AppShell>
  );
}
