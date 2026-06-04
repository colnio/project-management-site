/**
 * TasksTab — top-level task tracking UI.
 * Holds view toggle (Board/List), filter bar, and "+ New task" button.
 * Props: { projectId, iterationId? }
 */
import { useState } from 'react';
import { useProjectTasks, useIterationTasks, type Task } from '@/hooks/useTaskQueries';
import { useProject, useWorkspaceMembers } from '@/hooks/useQueries';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import type { MemberView } from '@/hooks/useWorkspaceQueries';
import { memberLabel } from '@/lib/userDisplay';
import { TaskBoard } from './TaskBoard';
import { TaskList } from './TaskList';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { NewTaskDialog } from './NewTaskDialog';

type View = 'board' | 'list';

const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'] as const;
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

interface TasksTabProps {
  projectId: string;
  iterationId?: string;
}

export function TasksTab({ projectId, iterationId }: TasksTabProps) {
  const [view, setView] = useState<View>('board');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  // Load project to get workspaceId
  const { data: project } = useProject(projectId);
  const { data: members = [] } = useWorkspaceMembers(project?.workspace_id);

  // Fetch tasks — use iteration-scoped query if iterationId provided, else project-wide
  const projectTasksResult = useProjectTasks(
    iterationId ? undefined : projectId,
    iterationId ? undefined : {},
  );
  const iterationTasksResult = useIterationTasks(iterationId);

  const { data: rawTasks, isLoading, isError } = iterationId
    ? iterationTasksResult
    : projectTasksResult;

  const allTasks: Task[] = rawTasks ?? [];

  // Client-side filtering
  const filtered = allTasks.filter(t => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterAssignee && t.assignee_user_id !== filterAssignee) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 12,
    background: 'var(--paper-2)',
    border: '1px solid var(--line)',
    borderRadius: 5,
    color: 'var(--ink)',
    padding: '5px 10px',
    cursor: 'pointer',
  };

  return (
    <div className="page-wrap wide">
      {/* Header bar */}
      <div className="section-h" style={{ marginBottom: 14 }}>
        <h2>Tasks</h2>
        <span className="meta">{allTasks.length} total</span>
        <div className="right">
          <button
            className="top-btn primary"
            style={{ fontSize: 12 }}
            onClick={() => setNewTaskOpen(true)}
          >
            + New task
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`status-opt${view === 'board' ? ' sel' : ''}`}
            style={{ fontSize: 12 }}
            onClick={() => setView('board')}
          >
            Board
          </button>
          <button
            className={`status-opt${view === 'list' ? ' sel' : ''}`}
            style={{ fontSize: 12 }}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>

        <div
          style={{
            width: 1,
            height: 22,
            background: 'var(--line)',
            alignSelf: 'center',
          }}
        />

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={`status-opt${filterStatus === '' ? ' sel' : ''}`}
            style={{ fontSize: 12 }}
            onClick={() => setFilterStatus('')}
          >
            All statuses
          </button>
          {TASK_STATUSES.map(s => (
            <button
              key={s}
              className={`status-opt${filterStatus === s ? ' sel' : ''}`}
              style={{ fontSize: 12 }}
              onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {/* Assignee filter */}
        {members.length > 0 && (
          <select
            style={selectStyle}
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
          >
            <option value="">All assignees</option>
            {members.map((m: MemberView) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
        )}

        {/* Search */}
        <input
          className="field-input"
          style={{ fontSize: 12, padding: '5px 10px', minWidth: 160 }}
          placeholder="Search tasks…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState message="Loading tasks…" />
      ) : isError ? (
        <ErrorState message="Failed to load tasks." />
      ) : view === 'board' ? (
        <TaskBoard
          tasks={filtered}
          projectId={projectId}
          members={members}
          onOpen={setSelectedTaskId}
        />
      ) : (
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <TaskList
            tasks={filtered}
            projectId={projectId}
            members={members}
            onOpen={setSelectedTaskId}
          />
        </div>
      )}

      {/* Dialogs / drawers */}
      {newTaskOpen && (
        <NewTaskDialog
          projectId={projectId}
          iterationId={iterationId}
          onClose={() => setNewTaskOpen(false)}
        />
      )}
      {selectedTaskId && (
        <TaskDetailDrawer
          taskId={selectedTaskId}
          projectId={projectId}
          members={members}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
