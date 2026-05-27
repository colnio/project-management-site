/**
 * IterationStatusControls — compact status-transition buttons for an iteration.
 *
 * Props
 *   iterationId  — the iteration's ID
 *   projectId    — the project that owns the iteration (for cache invalidation)
 *   status       — current iteration status
 *
 * Status transitions:
 *   planned  → Start   → active
 *   active   → Stop    → done
 *   done     → Reopen  → planned
 *   blocked  → Resume  → active  |  Stop → done
 */

import { useUpdateIteration } from '@/hooks/useQueries';

interface IterationStatusControlsProps {
  iterationId: string;
  projectId: string;
  status: string;
}

export function IterationStatusControls({
  iterationId,
  projectId,
  status,
}: IterationStatusControlsProps) {
  const update = useUpdateIteration(iterationId, projectId);

  const setStatus = (next: string) => {
    void update.mutateAsync({ status: next });
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
      {status === 'planned' && (
        <button
          className="top-btn primary"
          onClick={() => setStatus('active')}
          disabled={update.isPending}
        >
          Start
        </button>
      )}
      {status === 'active' && (
        <button
          className="top-btn"
          onClick={() => setStatus('done')}
          disabled={update.isPending}
        >
          Stop
        </button>
      )}
      {status === 'done' && (
        <button
          className="top-btn"
          onClick={() => setStatus('planned')}
          disabled={update.isPending}
        >
          Reopen
        </button>
      )}
      {status === 'blocked' && (
        <>
          <button
            className="top-btn primary"
            onClick={() => setStatus('active')}
            disabled={update.isPending}
          >
            Resume
          </button>
          <button
            className="top-btn"
            onClick={() => setStatus('done')}
            disabled={update.isPending}
          >
            Stop
          </button>
        </>
      )}
    </div>
  );
}
