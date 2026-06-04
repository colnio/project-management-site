/**
 * ActivityDashboard — full-width home-page activity section.
 * Renders one WorkspaceActivityBlock per workspace.
 */
import { useWorkspaces } from '@/hooks/useQueries';
import { LoadingState, EmptyState } from '@/components/LoadingState';
import { WorkspaceActivityBlock } from './WorkspaceActivityBlock';

export function ActivityDashboard() {
  const { data: workspaces = [], isLoading } = useWorkspaces();

  return (
    <div style={{ marginTop: 28 }}>
      {/* Section heading — mirrors the "Projects" h2 in HomePage */}
      <div className="section-h" style={{ marginBottom: 14 }}>
        <h2>Activity</h2>
      </div>

      {isLoading ? (
        <LoadingState message="Loading workspaces…" />
      ) : workspaces.length === 0 ? (
        <EmptyState message="Join or create a workspace to see activity." />
      ) : (
        workspaces.map(ws => (
          <WorkspaceActivityBlock key={ws.id} workspace={ws} />
        ))
      )}
    </div>
  );
}
