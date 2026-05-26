/**
 * F1 — Settings page
 * Route: /settings
 * - API Tokens: list PATs, create (with one-time secret reveal + copy), revoke
 * - Calendar subscription: show .ics URL, rotate, scope toggle
 */
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import {
  useTokens,
  useCreateToken,
  useRevokeToken,
  useCalSubscription,
  useRotateCalSubscription,
  usePatchCalSubscription,
} from '@/hooks/useArtifactQueries';
import type { PATInfo, CreateTokenOutput } from '@/hooks/useArtifactQueries';
import { useWorkspaces } from '@/hooks/useQueries';
import { WorkspaceAutonomySection } from '@/components/AutonomyConfig';

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

// ─── Calendar subscription section ───────────────────────────────────────────

function CalendarSection() {
  const { data: sub, isLoading, isError } = useCalSubscription();
  const rotate = useRotateCalSubscription();
  const patchSub = usePatchCalSubscription();
  const [rotateConfirm, setRotateConfirm] = useState(false);

  if (isLoading) return <LoadingState message="Loading calendar…" />;
  if (isError) return <ErrorState message="Failed to load calendar subscription." />;
  if (!sub) return <EmptyState message="No subscription found." />;

  const icsAbsUrl = `http://localhost:8080${sub.ics_url}`;

  const handleRotate = async () => {
    await rotate.mutateAsync();
    setRotateConfirm(false);
  };

  return (
    <>
      {/* ICS URL */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Calendar URL (.ics)</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '8px 12px' }}>
          <code style={{ fontFamily: 'var(--mono)', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
            {icsAbsUrl}
          </code>
          <CopyButton value={icsAbsUrl} label="Copy URL" />
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', marginTop: 6 }}>
          Paste this URL into your calendar app (Google Calendar, Apple Calendar, Outlook…)
        </div>
      </div>

      {/* Scope toggle */}
      <div style={{ marginBottom: 24 }}>
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
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginTop: 6, display: 'block' }}>
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
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--warn)' }}>
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
              <button className="top-btn" style={{ fontSize: 12 }} onClick={() => setRotateConfirm(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="top-btn" style={{ fontSize: 12 }} onClick={() => setRotateConfirm(true)}>
                Rotate URL
              </button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)' }}>
                Invalidates the current .ics URL
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Workspace Autonomy wrapper ───────────────────────────────────────────────

function WorkspaceAutonomyWrapper() {
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const ws = workspaces[0];

  if (isLoading) return <LoadingState message="Loading workspace…" />;
  if (!ws) return <ErrorState message="No workspace found." />;

  return <WorkspaceAutonomySection workspaceId={ws.id} />;
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
