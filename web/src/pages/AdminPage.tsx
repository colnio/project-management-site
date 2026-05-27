/**
 * AdminPage — /admin
 * Sections: Workspace info, AI overview, Members table, User management, Risk workflows, Audit log, Backups.
 */
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { Avatar } from '@/components/Avatar';
import { useWorkspaceMembers, useCurrentWorkspace } from '@/hooks/useQueries';
import { useAIUsage, useWorkflows } from '@/hooks/useAIQueries';
import { useAuditLog } from '@/hooks/useWorkspaceQueries';
import type { MemberView } from '@/hooks/useWorkspaceQueries';
import type { AuditEntry } from '@/hooks/useWorkspaceQueries';
import { useAdminUsers, useUpdateAdminUser, useDeleteAdminUser } from '@/hooks/useAdminQueries';
import type { AdminUserView } from '@/api/types';
import { useAuth } from '@/hooks/useAuth';
import { isPrivileged } from '@/api/types';

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: 32 }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-2)' }}>
          {title}
        </div>
      </div>
      <div style={{ padding: '20px', background: 'var(--surface)' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Workspace info ───────────────────────────────────────────────────────────

function WorkspaceInfoSection({ workspaceId }: { workspaceId: string | undefined }) {
  const { workspaces } = useCurrentWorkspace();
  const isLoading = workspaces.length === 0;
  const ws = workspaces.find(w => w.id === workspaceId) ?? workspaces[0];

  if (isLoading) return <LoadingState message="Loading workspace…" />;
  if (!ws) return <ErrorState message="No workspace found." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Name</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{ws.name}</div>
      </div>
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Slug</div>
        <code style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ember)' }}>{ws.slug}</code>
      </div>
    </div>
  );
}

// ─── AI overview ──────────────────────────────────────────────────────────────

function AIOverviewSection({ workspaceId }: { workspaceId: string }) {
  const { data: usage, isLoading, isError } = useAIUsage(workspaceId);

  if (isLoading) return <LoadingState message="Loading AI usage…" />;
  if (isError || !usage) return <ErrorState message="Failed to load AI usage." />;

  const pct = Math.min(100, Math.round(usage.pct * 100));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Spent Today', value: `$${usage.spent_today.toFixed(4)}` },
          { label: 'Spent This Month', value: `$${usage.spent_month.toFixed(4)}` },
          { label: 'Monthly Cap', value: `$${usage.monthly_cap.toFixed(2)}` },
        ].map(kpi => (
          <div key={kpi.label} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', background: 'var(--paper-2)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {kpi.label}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Usage bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>Monthly usage</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: pct > 80 ? 'var(--bad)' : pct > 60 ? 'var(--warn)' : 'var(--muted-2)' }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--paper-3)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: pct > 80 ? 'var(--bad)' : pct > 60 ? 'var(--warn)' : 'var(--ember)', transition: 'width 0.4s ease' }} />
        </div>
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
        Model: {usage.model}
      </div>
      {/* Per-feature breakdown: not exposed by API — showing totals only (deviation). */}
    </div>
  );
}

// ─── Members table ────────────────────────────────────────────────────────────

function MembersSection({ workspaceId }: { workspaceId: string }) {
  const { data: rawMembers = [], isLoading, isError } = useWorkspaceMembers(workspaceId);
  const members = rawMembers as unknown as MemberView[];

  if (isLoading) return <LoadingState message="Loading members…" />;
  if (isError) return <ErrorState message="Failed to load members." />;
  if (members.length === 0) return <EmptyState message="No members." />;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 120px 140px', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span />
        <span>Member</span>
        <span>Role</span>
        <span>Joined</span>
      </div>
      {members.map(m => {
        const dn = m.display_name || m.email;
        return (
          <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 120px 140px', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
            <Avatar name={dn} size={28} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{dn}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>{m.email}</div>
            </div>
            <span className="pill">{m.role}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-2)' }}>
              {new Date(m.created_at).toLocaleDateString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Workflows section ────────────────────────────────────────────────────────

function WorkflowsSection() {
  const { data: workflows = [], isLoading, isError } = useWorkflows();

  if (isLoading) return <LoadingState message="Loading workflows…" />;
  if (isError) return <ErrorState message="Failed to load workflows." />;
  if (workflows.length === 0) return <EmptyState message="No workflows." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {workflows.map(wf => (
        <div key={wf.key} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', background: 'var(--paper-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontWeight: 500, fontSize: 13.5 }}>{wf.title}</span>
            <span className="pill">{wf.scope}</span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginBottom: 6 }}>{wf.key}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{wf.description}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Audit log section ────────────────────────────────────────────────────────

function AuditSection() {
  const { data: entries = [], isLoading, isError } = useAuditLog();

  if (isLoading) return <LoadingState message="Loading audit log…" />;
  if (isError) return <ErrorState message="Failed to load audit log. (Requires system admin role.)" />;
  if (entries.length === 0) return <EmptyState message="No audit entries." />;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span>Action</span>
        <span>Resource</span>
        <span>Actor</span>
        <span>When</span>
      </div>
      {(entries as AuditEntry[]).slice(0, 20).map((e, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)', alignItems: 'start', fontSize: 12 }}>
          <span style={{ fontWeight: 500 }}>{e.action}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted)' }}>{e.resource_type}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.actor.slice(0, 8)}…
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>
            {new Date(e.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── User management section ──────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  suspended: 'Suspended',
};

const ROLE_OPTIONS: { value: 'admin' | 'pi' | 'member'; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'pi', label: 'PI' },
  { value: 'admin', label: 'Admin' },
];

function statusPillStyle(status: string): React.CSSProperties {
  if (status === 'approved') return { background: 'var(--pill-active-bg, #e6f4ea)', color: 'var(--good, #2e7d32)', border: '1px solid #b7dfbb', borderRadius: 99, padding: '1px 8px', fontFamily: 'var(--mono)', fontSize: 10.5 };
  if (status === 'pending') return { background: 'var(--pill-planned-bg, #fff8e1)', color: 'var(--warn, #b45309)', border: '1px solid #f3d78a', borderRadius: 99, padding: '1px 8px', fontFamily: 'var(--mono)', fontSize: 10.5 };
  return { background: 'var(--pill-blocked-bg, #fce8e4)', color: 'var(--bad, #b94e3c)', border: '1px solid var(--pill-blocked-bd, #f0b8b0)', borderRadius: 99, padding: '1px 8px', fontFamily: 'var(--mono)', fontSize: 10.5 };
}

function UsersSection() {
  const { data: users = [], isLoading, isError } = useAdminUsers();
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const [confirmReject, setConfirmReject] = useState<string | null>(null);

  if (isLoading) return <LoadingState message="Loading users…" />;
  if (isError) return <ErrorState message="Failed to load users. (Requires admin or PI role.)" />;
  if (users.length === 0) return <EmptyState message="No users found." />;

  const handleRoleChange = (user: AdminUserView, role: 'admin' | 'pi' | 'member') => {
    updateUser.mutate({ id: user.id, global_role: role });
  };

  const handleApprove = (user: AdminUserView) => {
    updateUser.mutate({ id: user.id, status: 'approved' });
  };

  const handleSuspend = (user: AdminUserView) => {
    updateUser.mutate({ id: user.id, status: 'suspended' });
  };

  const handleReject = (userId: string) => {
    deleteUser.mutate(userId);
    setConfirmReject(null);
  };

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 120px 180px',
          gap: 10,
          padding: '6px 0',
          borderBottom: '1px solid var(--line)',
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: 'var(--muted-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span>User</span>
        <span>Status</span>
        <span>Role</span>
        <span>Actions</span>
      </div>

      {(users as AdminUserView[]).map(u => {
        const dn = u.display_name || u.email;
        return (
          <div
            key={u.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 120px 180px',
              gap: 10,
              padding: '10px 0',
              borderBottom: '1px solid var(--line)',
              alignItems: 'center',
            }}
          >
            {/* User info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={dn} size={28} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{dn}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>
                  {u.email}
                </div>
                {u.title && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)' }}>
                    {u.title}
                  </div>
                )}
              </div>
            </div>

            {/* Status badge */}
            <span style={statusPillStyle(u.status)}>
              {STATUS_LABELS[u.status] ?? u.status}
            </span>

            {/* Role dropdown */}
            <select
              value={u.global_role}
              onChange={e => handleRoleChange(u, e.target.value as 'admin' | 'pi' | 'member')}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11.5,
                border: '1px solid var(--line-2)',
                borderRadius: 5,
                padding: '4px 6px',
                background: 'var(--paper)',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              {ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {u.status !== 'approved' && (
                <button
                  className="top-btn primary"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => handleApprove(u)}
                  disabled={updateUser.isPending}
                >
                  Approve
                </button>
              )}
              {u.status === 'approved' && (
                <button
                  className="top-btn"
                  style={{ fontSize: 11, padding: '3px 8px', color: 'var(--warn)' }}
                  onClick={() => handleSuspend(u)}
                  disabled={updateUser.isPending}
                >
                  Suspend
                </button>
              )}
              {u.status === 'suspended' && (
                <button
                  className="top-btn"
                  style={{ fontSize: 11, padding: '3px 8px', color: 'var(--good)' }}
                  onClick={() => handleApprove(u)}
                  disabled={updateUser.isPending}
                >
                  Reinstate
                </button>
              )}
              {u.status === 'pending' && (
                <>
                  {confirmReject === u.id ? (
                    <>
                      <button
                        className="top-btn primary"
                        style={{ fontSize: 11, padding: '3px 8px', background: 'var(--bad)', color: '#fff' }}
                        onClick={() => handleReject(u.id)}
                      >
                        Confirm
                      </button>
                      <button
                        className="top-btn"
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={() => setConfirmReject(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="top-btn"
                      style={{ fontSize: 11, padding: '3px 8px', color: 'var(--bad)' }}
                      onClick={() => setConfirmReject(u.id)}
                    >
                      Reject
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { workspaceId } = useCurrentWorkspace();
  const { user } = useAuth();
  const crumbs = [{ label: 'Admin' }];

  if (!isPrivileged(user)) {
    return (
      <AppShell topBarCrumbs={crumbs}>
        <div className="page-wrap" style={{ paddingTop: 28 }}>
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '28px 24px',
              background: 'var(--surface)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Access restricted</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>
              The Admin section is only available to PI and Admin users.
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 28px' }}>
          Workspace Admin
        </h1>

        <SectionCard title="Workspace Settings">
          <WorkspaceInfoSection workspaceId={workspaceId} />
        </SectionCard>

        {workspaceId && (
          <SectionCard title="AI Overview">
            <AIOverviewSection workspaceId={workspaceId} />
          </SectionCard>
        )}

        {workspaceId && (
          <SectionCard title="Members">
            <MembersSection workspaceId={workspaceId} />
          </SectionCard>
        )}

        <SectionCard title="User Management">
          <UsersSection />
        </SectionCard>

        <SectionCard title="Risk Workflow Library">
          <WorkflowsSection />
        </SectionCard>

        <SectionCard title="Audit Log">
          <AuditSection />
        </SectionCard>

        <SectionCard title="Backups">
          <div style={{ color: 'var(--muted-2)', fontFamily: 'var(--mono)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, opacity: 0.4 }}>∅</span>
            Coming soon
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
