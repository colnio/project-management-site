/**
 * CalendarSubscriptionPanel — reusable .ics subscription UI.
 *
 * Used in both SettingsPage (inside a SectionCard) and CalendarPage
 * (collapsible secondary placement).
 */
import { useState } from 'react';
import {
  useCalSubscription,
  useRotateCalSubscription,
  usePatchCalSubscription,
} from '@/hooks/useArtifactQueries';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        color: 'var(--muted-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      className="top-btn"
      style={{ fontSize: 12, color: copied ? 'var(--good)' : undefined }}
      onClick={() => void copy()}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function CalendarSubscriptionPanel() {
  const { data: sub, isLoading, isError } = useCalSubscription();
  const rotate = useRotateCalSubscription();
  const patchSub = usePatchCalSubscription();
  const [rotateConfirm, setRotateConfirm] = useState(false);

  if (isLoading) return <LoadingState message="Loading calendar subscription…" />;
  if (isError) return <ErrorState message="Failed to load calendar subscription." />;
  if (!sub) return <EmptyState message="No subscription found." />;

  const icsAbsUrl = `http://localhost:8080${sub.ics_url}`;

  const handleRotate = async () => {
    await rotate.mutateAsync();
    setRotateConfirm(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ICS URL */}
      <div>
        <FieldLabel>Calendar URL (.ics)</FieldLabel>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--paper-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 6,
            padding: '8px 12px',
          }}
        >
          <code
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--ink)',
            }}
          >
            {icsAbsUrl}
          </code>
          <CopyButton value={icsAbsUrl} label="Copy URL" />
        </div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
            marginTop: 6,
          }}
        >
          Paste this URL into Google Calendar, Apple Calendar, or Outlook to subscribe.
        </div>
      </div>

      {/* Scope toggle */}
      <div>
        <FieldLabel>Scope</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'selected'].map(scope => (
            <button
              key={scope}
              className={`status-opt${sub.scope === scope ? ' sel' : ''}`}
              onClick={() => void patchSub.mutate({ scope })}
              disabled={patchSub.isPending}
            >
              {scope === 'all' ? 'All visible projects' : 'Selected projects'}
            </button>
          ))}
        </div>
        {patchSub.isPending && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted)',
              marginTop: 6,
              display: 'block',
            }}
          >
            Saving…
          </span>
        )}
      </div>

      {/* Rotate */}
      <div>
        <FieldLabel>Rotate URL</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {rotateConfirm ? (
            <>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--warn)',
                }}
              >
                This will invalidate your current calendar URL.
              </span>
              <button
                className="top-btn primary"
                style={{ background: 'var(--warn)', color: '#fff', fontSize: 12 }}
                onClick={() => void handleRotate()}
                disabled={rotate.isPending}
              >
                {rotate.isPending ? 'Rotating…' : 'Yes, rotate'}
              </button>
              <button
                className="top-btn"
                style={{ fontSize: 12 }}
                onClick={() => setRotateConfirm(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="top-btn"
                style={{ fontSize: 12 }}
                onClick={() => setRotateConfirm(true)}
              >
                Rotate URL
              </button>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10.5,
                  color: 'var(--muted-2)',
                }}
              >
                Invalidates the current .ics URL
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
