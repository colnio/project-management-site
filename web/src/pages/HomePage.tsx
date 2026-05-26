import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useQueries';
import { AppShell } from '@/components/AppShell';
import { LoadingState, EmptyState } from '@/components/LoadingState';
import { Link } from '@tanstack/react-router';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const { user } = useAuth();
  const { data: workspaces = [], isLoading } = useWorkspaces();

  const crumbs = [{ label: 'Home' }];

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap wide">
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
          <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.55 }}>
            Select a workspace below to browse projects.
          </div>
        </div>

        <div className="section-h">
          <h2>Workspaces</h2>
          <span className="meta">{workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <LoadingState message="Loading workspaces…" />
        ) : workspaces.length === 0 ? (
          <EmptyState message="No workspaces yet. Visit /workspaces to create one." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {workspaces.map(ws => (
              <Link
                key={ws.id}
                to="/workspaces"
                style={{ textDecoration: 'none' }}
              >
                <div
                  className="rec"
                  style={{ cursor: 'default' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: 'var(--ink)',
                        color: 'var(--paper)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 22,
                        fontFamily: 'Libre Baskerville, serif',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {ws.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                        {ws.name}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          color: 'var(--muted)',
                          marginTop: 2,
                        }}
                      >
                        {ws.slug}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
