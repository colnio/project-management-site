/**
 * TaskProgressTimeline — activity log + comment composer for a task.
 */
import { useState } from 'react';
import { useTaskProgress, useAddTaskComment, type TaskProgress } from '@/hooks/useTaskQueries';
import { LoadingState } from '@/components/LoadingState';
import type { MemberView } from '@/hooks/useWorkspaceQueries';
import { memberLabel, resolveUserLabel, buildUserDirectory } from '@/lib/userDisplay';
import { fmtRelative } from '@/lib/formatDate';

function humanizeEvent(entry: TaskProgress, members: MemberView[]): string {
  const dir = buildUserDirectory(members);
  switch (entry.event_type) {
    case 'created':
      return 'created the task';
    case 'status_change':
      return `moved ${entry.from_status ?? '—'} → ${entry.to_status ?? '—'}`;
    case 'reassign': {
      const to = entry.to_assignee ? resolveUserLabel(dir, entry.to_assignee) : '—';
      return `reassigned to ${to}`;
    }
    case 'reopen':
      return `reopened to ${entry.to_status ?? '—'}`;
    case 'delay':
      return 'pushed the estimate';
    case 'comment':
      return entry.reason ?? '';
    case 'reference_added':
      return `added reference ${entry.reason ?? ''}`;
    case 'reference_removed':
      return `removed reference ${entry.reason ?? ''}`;
    default:
      return entry.event_type;
  }
}

function resolveAuthorLabel(entry: TaskProgress, members: MemberView[]): string {
  if (entry.author_name) return entry.author_name;
  const m = members.find(x => x.user_id === entry.author_id);
  return m ? memberLabel(m) : entry.author_id.slice(0, 8);
}

interface TaskProgressTimelineProps {
  taskId: string;
  members: MemberView[];
}

export function TaskProgressTimeline({ taskId, members }: TaskProgressTimelineProps) {
  const { data: entries = [], isLoading } = useTaskProgress(taskId);
  const addComment = useAddTaskComment(taskId);
  const [commentText, setCommentText] = useState('');
  const errMsg = addComment.isError ? (addComment.error as Error).message : null;

  const handleComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate({ body: commentText.trim() }, {
      onSuccess: () => setCommentText(''),
    });
  };

  if (isLoading) return <LoadingState message="Loading activity…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Activity entries */}
      {entries.length === 0 ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)', padding: '8px 0' }}>
          No activity yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
          {entries.map(e => {
            const isComment = e.event_type === 'comment';
            const desc = humanizeEvent(e, members);
            const hasExtra =
              !isComment &&
              e.reason &&
              (e.event_type === 'reassign' || e.event_type === 'reopen' || e.event_type === 'delay');

            return (
              <div
                key={e.id}
                style={{
                  padding: isComment ? '10px 12px' : '6px 12px',
                  background: isComment ? 'var(--paper-2)' : 'transparent',
                  border: isComment ? '1px solid var(--line)' : 'none',
                  borderRadius: isComment ? 7 : 0,
                  borderLeft: !isComment ? '2px solid var(--line)' : undefined,
                  marginLeft: !isComment ? 4 : 0,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10.5,
                    color: 'var(--muted-2)',
                    marginBottom: isComment ? 4 : 2,
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                    {resolveAuthorLabel(e, members)}
                  </span>
                  {' · '}
                  {fmtRelative(e.created_at)}
                </div>
                {isComment ? (
                  <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {desc}
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                    {desc}
                    {hasExtra && (
                      <span style={{ marginLeft: 6, fontStyle: 'italic', color: 'var(--muted-2)' }}>
                        — {e.reason}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Comment composer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          className="field-input"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 68, resize: 'vertical' }}
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          placeholder="Add a comment…"
          disabled={addComment.isPending}
        />
        {errMsg && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bad)' }}>
            {errMsg}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="top-btn primary"
            onClick={handleComment}
            disabled={!commentText.trim() || addComment.isPending}
            style={{ fontSize: 12 }}
          >
            {addComment.isPending ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
