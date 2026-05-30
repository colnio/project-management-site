/**
 * ApprovalCommentThread — renders the comment thread for an approval request,
 * including a composer for posting new comments. Uses inline styles to match
 * the rest of the codebase.
 */
import { useState } from 'react';
import {
  useApprovalComments,
  useCreateApprovalComment,
} from '@/hooks/useApprovalQueries';
import { fmtRelative } from '@/lib/formatDate';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalCommentThreadProps {
  requestId: string;
}

// ─── Single comment row ───────────────────────────────────────────────────────

function CommentRow({ authorName, body, createdAt }: { authorName: string; body: string; createdAt: string }) {
  return (
    <div
      style={{
        padding: '10px 0',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--ink)' }}>
          {authorName}
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
          }}
        >
          {fmtRelative(createdAt)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}

// ─── Comment thread + composer ────────────────────────────────────────────────

export function ApprovalCommentThread({ requestId }: ApprovalCommentThreadProps) {
  const { data: comments = [], isLoading } = useApprovalComments(requestId);
  const createComment = useCreateApprovalComment(requestId);
  const [draft, setDraft] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = () => {
    const body = draft.trim();
    if (!body) return;
    setSubmitError(null);
    createComment.mutate(body, {
      onSuccess: () => setDraft(''),
      onError: (err) =>
        setSubmitError(err instanceof Error ? err.message : 'Failed to post comment'),
    });
  };

  return (
    <div style={{ marginTop: 16 }}>
      {/* Section heading */}
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--muted-2)',
          marginBottom: 8,
        }}
      >
        Comments
        {comments.length > 0 && (
          <span style={{ marginLeft: 6, color: 'var(--muted)' }}>{comments.length}</span>
        )}
      </div>

      {/* Comment list */}
      {isLoading && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)', padding: '6px 0' }}>
          Loading comments…
        </div>
      )}
      {!isLoading && comments.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted-2)', padding: '6px 0' }}>
          No comments yet.
        </div>
      )}
      {comments.map(c => (
        <CommentRow
          key={c.id}
          authorName={c.author_name}
          body={c.body}
          createdAt={c.created_at}
        />
      ))}

      {/* Composer */}
      <div style={{ marginTop: 12 }}>
        <textarea
          className="field-input"
          rows={3}
          placeholder="Write a comment…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={createComment.isPending}
          style={{
            width: '100%',
            resize: 'vertical',
            fontFamily: 'var(--sans)',
            fontSize: 13,
          }}
        />
        {submitError && (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--bad)',
              marginTop: 4,
            }}
          >
            {submitError}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            className="top-btn primary"
            onClick={handleSubmit}
            disabled={!draft.trim() || createComment.isPending}
          >
            {createComment.isPending ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
