/**
 * MyTasksPage — /my-tasks
 * Shows all active tasks (backlog/todo/in_progress) assigned to the current
 * user, grouped by project, in the order returned by the API.
 */
import { Link } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { StatusPill } from '@/components/StatusPill';
import { useMyTasks, type AssignedTask } from '@/hooks/useTaskQueries';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Group the flat API-ordered list into consecutive project runs. */
function groupByProject(tasks: AssignedTask[]): Array<{
  projectId: string;
  projectName: string;
  workspaceName: string;
  tasks: AssignedTask[];
}> {
  const groups: Array<{
    projectId: string;
    projectName: string;
    workspaceName: string;
    tasks: AssignedTask[];
  }> = [];

  for (const task of tasks) {
    const last = groups[groups.length - 1];
    if (last && last.projectId === task.project_id) {
      last.tasks.push(task);
    } else {
      groups.push({
        projectId: task.project_id,
        projectName: task.project_name,
        workspaceName: task.workspace_name,
        tasks: [task],
      });
    }
  }

  return groups;
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task }: { task: AssignedTask }) {
  const href = `/projects/${task.project_id}?tab=tasks&task=${task.id}`;
  const isDelayed =
    task.estimated_finish_at &&
    task.status !== 'done' &&
    task.status !== 'cancelled' &&
    new Date(task.estimated_finish_at) < new Date();

  return (
    <a
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '9px 4px',
        borderBottom: '1px solid var(--line)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Status pill */}
      <span style={{ flexShrink: 0 }}>
        <StatusPill status={task.status} />
      </span>

      {/* Title */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: 500,
          fontSize: 13.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {task.title}
      </span>

      {/* Due date */}
      {task.estimated_finish_at && (
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: isDelayed ? 'var(--bad)' : 'var(--muted-2)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title="Estimated finish"
        >
          {fmtDate(task.estimated_finish_at)}
        </span>
      )}
    </a>
  );
}

// ─── Project group ────────────────────────────────────────────────────────────

interface ProjectGroupProps {
  projectId: string;
  projectName: string;
  workspaceName: string;
  tasks: AssignedTask[];
}

function ProjectGroup({ projectId, projectName, workspaceName, tasks }: ProjectGroupProps) {
  return (
    <div style={{ marginBottom: 28 }}>
      {/* Group header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 4,
          paddingBottom: 4,
          borderBottom: '1px solid var(--line-2)',
        }}
      >
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          search={{ tab: 'tasks' }}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--ink)',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {projectName}
        </Link>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
          }}
        >
          {workspaceName}
        </span>
      </div>

      {/* Task rows */}
      {tasks.map(t => (
        <TaskRow key={t.id} task={t} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MyTasksPage() {
  const { data: tasks = [], isLoading, isError } = useMyTasks();

  const crumbs = [{ label: 'My Tasks' }];
  const groups = groupByProject(tasks);

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 28,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            My Tasks
          </h1>
          {!isLoading && !isError && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11.5,
                color: 'var(--muted-2)',
              }}
            >
              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {isLoading && <LoadingState message="Loading tasks…" />}
        {isError && <ErrorState message="Failed to load tasks." />}

        {!isLoading && !isError && tasks.length === 0 && (
          <EmptyState message="No active tasks assigned to you." />
        )}

        {!isLoading && !isError && groups.length > 0 && (
          <div>
            {groups.map(g => (
              <ProjectGroup
                key={g.projectId}
                projectId={g.projectId}
                projectName={g.projectName}
                workspaceName={g.workspaceName}
                tasks={g.tasks}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
