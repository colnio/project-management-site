/**
 * FeedbackDialog — let any user submit feedback (message + category).
 * Uses the Backdrop + DialogCard pattern from tasks/NewTaskDialog.tsx.
 */
import { useState } from 'react';
import { useSubmitFeedback } from '@/hooks/useFeedbackQueries';

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.30)',
          zIndex: 200,
          backdropFilter: 'blur(3px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: '100%',
          maxWidth: 480,
          padding: '0 16px',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </>
  );
}

function DialogCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-2)',
        borderRadius: 12,
        padding: '24px 28px 22px',
        boxShadow: '0 24px 72px rgba(20,18,14,0.22)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        color: 'var(--muted-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  background: 'var(--paper-2)',
  border: '1px solid var(--line)',
  borderRadius: 5,
  color: 'var(--ink)',
  padding: '6px 10px',
  cursor: 'pointer',
  width: '100%',
};

type Category = 'bug' | 'idea' | 'other';

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category>('idea');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const submit = useSubmitFeedback();
  const errMsg = submit.isError ? (submit.error as Error).message : null;

  const handleSubmit = () => {
    if (!message.trim()) return;
    submit.mutate(
      { category, message: message.trim() },
      { onSuccess: () => setDone(true) },
    );
  };

  return (
    <Backdrop onClose={onClose}>
      <DialogCard>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            Send feedback
          </div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }} aria-label="Close">
            ✕
          </button>
        </div>

        {done ? (
          <>
            <div
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 13.5,
                color: 'var(--ink-2)',
                lineHeight: 1.6,
              }}
            >
              Thanks — your feedback has been recorded. We appreciate you helping
              improve the site.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
              <button className="top-btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 12.5,
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}
            >
              Spotted a bug or have an idea? Let us know — the admin team reviews
              all feedback.
            </div>

            {/* Category */}
            <div>
              <FieldLabel>Category</FieldLabel>
              <select
                style={selectStyle}
                value={category}
                onChange={e => setCategory(e.target.value as Category)}
                disabled={submit.isPending}
              >
                <option value="bug">Bug</option>
                <option value="idea">Idea</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Message */}
            <div>
              <FieldLabel>Message *</FieldLabel>
              <textarea
                className="field-input"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 110, resize: 'vertical' }}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us what's on your mind…"
                autoFocus
                maxLength={5000}
                disabled={submit.isPending}
              />
            </div>

            {/* Inline error */}
            {errMsg && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bad)' }}>
                {errMsg}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <button className="top-btn" onClick={onClose} disabled={submit.isPending}>
                Cancel
              </button>
              <button
                className="top-btn primary"
                onClick={handleSubmit}
                disabled={!message.trim() || submit.isPending}
              >
                {submit.isPending ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </>
        )}
      </DialogCard>
    </Backdrop>
  );
}
