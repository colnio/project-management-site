/**
 * F1 — Settings page
 * Route: /settings
 * - API Tokens: list PATs, create (with one-time secret reveal + copy), revoke
 * - Calendar subscription: show .ics URL, rotate, scope toggle
 */
import { useState, useEffect } from 'react';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import {
  useTokens,
  useCreateToken,
  useRevokeToken,
} from '@/hooks/useArtifactQueries';
import type { PATInfo, CreateTokenOutput } from '@/hooks/useArtifactQueries';
import { useCurrentWorkspace } from '@/hooks/useQueries';
import { useAuth } from '@/hooks/useAuth';
import { WorkspaceAutonomySection } from '@/components/AutonomyConfig';
import { CalendarSubscriptionPanel } from '@/components/CalendarSubscriptionPanel';

// ─── Known scopes ─────────────────────────────────────────────────────────────

const KNOWN_SCOPES = [
  'read:projects',
  'read:samples',
  'read:experiments',
  'read:artifacts',
  'read:pages',
  'read:events',
  'write:projects',
  'write:samples',
  'write:experiments',
  'write:artifacts',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
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
      // fallback for environments without clipboard API
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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: 32 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>
          {title}
        </div>
      </div>
      <div style={{ padding: '20px 20px', background: 'var(--surface)' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Token row ────────────────────────────────────────────────────────────────

function TokenRow({ token, onRevoke }: { token: PATInfo; onRevoke: () => void }) {
  const [confirming, setConfirming] = useState(false);

  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString() : '—';
  const isRevoked = !!token.revoked_at;

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 2, color: isRevoked ? 'var(--muted)' : 'var(--ink)', textDecoration: isRevoked ? 'line-through' : 'none' }}>
          {token.name}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>
          Created {fmtDate(token.created_at)}
          {token.last_used_at && ` · last used ${fmtDate(token.last_used_at)}`}
          {token.expires_at && ` · expires ${fmtDate(token.expires_at)}`}
        </div>
        {token.scopes && token.scopes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {token.scopes.map(s => (
              <span key={s} className="pill" style={{ fontSize: 10, padding: '1px 6px' }}>{s}</span>
            ))}
          </div>
        )}
      </div>

      {!isRevoked && (
        <>
          {confirming ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>Revoke?</span>
              <button className="top-btn primary" style={{ fontSize: 11, background: 'var(--bad)', color: '#fff' }} onClick={onRevoke}>
                Yes, revoke
              </button>
              <button className="top-btn" style={{ fontSize: 11 }} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button className="top-btn" style={{ fontSize: 12, color: 'var(--bad)' }} onClick={() => setConfirming(true)}>
              Revoke
            </button>
          )}
        </>
      )}
      {isRevoked && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--bad)' }}>revoked</span>
      )}
    </div>
  );
}

// ─── Create token dialog ──────────────────────────────────────────────────────

interface CreateTokenDialogProps {
  onClose: () => void;
  onCreated: (result: CreateTokenOutput) => void;
}

function CreateTokenDialog({ onClose, onCreated }: CreateTokenDialogProps) {
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [expiresAt, setExpiresAt] = useState('');
  const createToken = useCreateToken();

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    const result = await createToken.mutateAsync({
      name: name.trim(),
      scopes: Array.from(selectedScopes),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
    onCreated(result);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Create API Token</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Token name</FieldLabel>
            <input
              className="field-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. CI pipeline, notebook runner"
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Scopes</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {KNOWN_SCOPES.map(scope => (
                <button
                  key={scope}
                  onClick={() => toggleScope(scope)}
                  className={`status-opt${selectedScopes.has(scope) ? ' sel' : ''}`}
                  style={{ fontSize: 11.5 }}
                >
                  {scope}
                </button>
              ))}
            </div>
            {selectedScopes.size === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginTop: 6 }}>
                No scopes selected — token will have no permissions.
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Expires at (optional)</FieldLabel>
            <input
              type="date"
              className="field-input"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button
            className="top-btn primary"
            onClick={() => void handleCreate()}
            disabled={!name.trim() || createToken.isPending}
          >
            {createToken.isPending ? 'Creating…' : 'Create token'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Token secret reveal dialog ───────────────────────────────────────────────

function TokenSecretDialog({ result, onClose }: { result: CreateTokenOutput; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Token created — copy now</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{ fontFamily: 'var(--mono)', fontSize: 12, flex: 1, wordBreak: 'break-all', color: 'var(--ember)' }}>
              {result.token}
            </code>
            <CopyButton value={result.token} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--bad)', background: 'var(--pill-blocked-bg)', border: '1px solid var(--pill-blocked-bd)', borderRadius: 5, padding: '8px 12px' }}>
            This token will not be shown again. Copy it now.
          </div>
        </div>
        <div className="modal-foot">
          <button className="top-btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── API Tokens section ───────────────────────────────────────────────────────

function ApiTokensSection() {
  const { data: tokens = [], isLoading, isError } = useTokens();
  const revokeToken = useRevokeToken();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdResult, setCreatedResult] = useState<CreateTokenOutput | null>(null);

  if (isLoading) return <LoadingState message="Loading tokens…" />;
  if (isError) return <ErrorState message="Failed to load tokens." />;

  const activeTokens = tokens.filter(t => !t.revoked_at);
  const revokedTokens = tokens.filter(t => !!t.revoked_at);

  return (
    <>
      {createOpen && (
        <CreateTokenDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(result) => {
            setCreateOpen(false);
            setCreatedResult(result);
          }}
        />
      )}
      {createdResult && (
        <TokenSecretDialog result={createdResult} onClose={() => setCreatedResult(null)} />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="top-btn primary" onClick={() => setCreateOpen(true)}>
          + New token
        </button>
      </div>

      {activeTokens.length === 0 && revokedTokens.length === 0 && (
        <EmptyState message="No API tokens yet." />
      )}

      {activeTokens.map(t => (
        <TokenRow
          key={t.id}
          token={t}
          onRevoke={() => void revokeToken.mutate(t.id)}
        />
      ))}

      {revokedTokens.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 20, marginBottom: 8 }}>
            Revoked
          </div>
          {revokedTokens.map(t => (
            <TokenRow key={t.id} token={t} onRevoke={() => {}} />
          ))}
        </>
      )}
    </>
  );
}

// ─── Calendar subscription section (delegates to shared component) ────────────

function CalendarSection() {
  return <CalendarSubscriptionPanel />;
}

// ─── Profile section ─────────────────────────────────────────────────────────

function ProfileSection() {
  const { user } = useAuth();

  if (!user) return <ErrorState message="Not signed in." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <FieldLabel>Display Name</FieldLabel>
        <input
          className="field-input"
          defaultValue={user.display_name ?? ''}
          readOnly
          title="Display name editing requires a backend endpoint that is not yet available."
          style={{ cursor: 'not-allowed', opacity: 0.7 }}
        />
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginTop: 6 }}>
          Display name editing is read-only (no PATCH /v1/me endpoint). (Deviation)
        </div>
      </div>
      <div>
        <FieldLabel>Email</FieldLabel>
        <input
          className="field-input"
          defaultValue={user.email}
          readOnly
          style={{ cursor: 'not-allowed', opacity: 0.7 }}
        />
      </div>
    </div>
  );
}

// ─── Notifications section ────────────────────────────────────────────────────

const NOTIFICATION_KEYS = [
  { key: 'notif_pi_flag', label: 'PI review flags', description: 'Notify when a risk is flagged for PI review' },
  { key: 'notif_ai_proposal', label: 'AI proposals', description: 'Notify when an AI action awaits approval' },
  { key: 'notif_mentions', label: 'Mentions', description: 'Notify when you are mentioned' },
  { key: 'notif_meetings', label: 'Meeting reminders', description: 'Notify before scheduled meetings' },
] as const;

type NotifKey = typeof NOTIFICATION_KEYS[number]['key'];

function NotificationsSection() {
  const [prefs, setPrefs] = useState<Record<NotifKey, boolean>>(() => {
    try {
      const stored = localStorage.getItem('notif_prefs');
      if (stored) return JSON.parse(stored) as Record<NotifKey, boolean>;
    } catch {}
    return { notif_pi_flag: true, notif_ai_proposal: true, notif_mentions: true, notif_meetings: true };
  });

  useEffect(() => {
    localStorage.setItem('notif_prefs', JSON.stringify(prefs));
  }, [prefs]);

  const toggle = (key: NotifKey) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginBottom: 4 }}>
        Preferences stored locally in your browser.
      </div>
      {NOTIFICATION_KEYS.map(({ key, label, description }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => toggle(key)}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: prefs[key] ? 'var(--ember)' : 'var(--line-2)',
              position: 'relative',
              flexShrink: 0,
              transition: 'background 0.2s ease',
              border: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: prefs[key] ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s ease',
              }}
            />
          </button>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: 1 }}>{description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Security / TOTP section ──────────────────────────────────────────────────

function SecuritySection() {
  // No TOTP backend endpoint exists — UI rendered in disabled "Coming soon" state. (Deviation)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 6 }}>
          Two-Factor Authentication (TOTP)
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 14 }}>
          Protect your account with an authenticator app like Google Authenticator or Authy.
        </div>
        <button
          className="top-btn"
          disabled
          title="TOTP endpoint not yet available"
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
        >
          Enable 2FA — Coming soon
        </button>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginTop: 8 }}>
          TOTP backend endpoint not yet available. (Deviation)
        </div>
      </div>
    </div>
  );
}

// ─── Workspace Autonomy wrapper ───────────────────────────────────────────────

function WorkspaceAutonomyWrapper() {
  const { workspaceId, workspaces } = useCurrentWorkspace();
  const isLoading = workspaces.length === 0;

  if (isLoading) return <LoadingState message="Loading workspace…" />;
  if (!workspaceId) return <ErrorState message="No workspace found." />;

  return <WorkspaceAutonomySection workspaceId={workspaceId} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const crumbs = [{ label: 'Settings' }];

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 28px' }}>
          Settings
        </h1>

        <SectionCard title="Profile">
          <ProfileSection />
        </SectionCard>

        <SectionCard title="Notifications">
          <NotificationsSection />
        </SectionCard>

        <SectionCard title="Security">
          <SecuritySection />
        </SectionCard>

        <SectionCard title="API Tokens">
          <ApiTokensSection />
        </SectionCard>

        <SectionCard title="Calendar Subscription">
          <CalendarSection />
        </SectionCard>

        <SectionCard title="AI Autonomy (Workspace)">
          <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            These settings control how AI behaves across all projects in this workspace.
            Individual projects can use a more restrictive setting, but cannot exceed the workspace cap.
          </div>
          <WorkspaceAutonomyWrapper />
        </SectionCard>
      </div>
    </AppShell>
  );
}
