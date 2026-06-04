/**
 * TaskBoard — Kanban-style board layout.
 * Columns in fixed status order; each column scrolls independently.
 * No drag-and-drop.
 */
import { StatusPill } from '@/components/StatusPill';
import { TaskCard } from './TaskCard';
import type { Task } from '@/hooks/useTaskQueries';
import type { MemberView } from '@/hooks/useWorkspaceQueries';

const STATUS_ORDER: Task['status'][] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];

const STATUS_LABEL: Record<Task['status'], string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

interface TaskBoardProps {
  tasks: Task[];
  projectId: string;
  members: MemberView[];
  onOpen: (id: string) => void;
}

export function TaskBoard({ tasks, projectId, members, onOpen }: TaskBoardProps) {
  const byStatus: Record<Task['status'], Task[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    done: [],
    cancelled: [],
  };

  for (const t of tasks) {
    if (byStatus[t.status]) {
      byStatus[t.status].push(t);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 16,
        alignItems: 'flex-start',
      }}
    >
      {STATUS_ORDER.map(status => {
        const col = byStatus[status];
        return (
          <div
            key={status}
            style={{
              flex: '0 0 240px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--paper-2)',
              border: '1px solid var(--line)',
              borderRadius: 9,
              overflow: 'hidden',
            }}
          >
            {/* Column header */}
            <div
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--paper-2)',
              }}
            >
              <StatusPill status={status} />
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10.5,
                  color: 'var(--muted-2)',
                  marginLeft: 'auto',
                }}
              >
                {col.length}
              </span>
            </div>

            {/* Cards */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 8,
                minHeight: 60,
                maxHeight: 'calc(100vh - 260px)',
                overflowY: 'auto',
              }}
            >
              {col.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--muted-2)',
                    padding: '12px 0',
                  }}
                >
                  {STATUS_LABEL[status] === 'Backlog' ? 'Empty' : 'None'}
                </div>
              ) : (
                col.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    projectId={projectId}
                    members={members}
                    onOpen={onOpen}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
