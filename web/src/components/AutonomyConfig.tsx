/**
 * G8 — Autonomy Config
 * Controls for AI autonomy mode and allowed_tools at workspace or project scope.
 * Used in SettingsPage (workspace) and ProjectDetailPage (project).
 */
import { useState, useEffect } from 'react';
import {
  useWorkspaceAutonomy,
  useUpdateWorkspaceAutonomy,
  useProjectAutonomy,
  useUpdateProjectAutonomy,
} from '@/hooks/useAIQueries';
import type { AutonomyConfig } from '@/hooks/useAIQueries';
import { LoadingState, ErrorState } from '@/components/LoadingState';

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTONOMY_MODES: {
  value: AutonomyConfig['mode'];
  label: string;
  description: string;
}[] = [
  {
    value: 'read_only',
    label: 'Read only',
    description: 'AI can search and read project data, but cannot propose or make any changes.',
  },
  {
    value: 'suggest_writes',
    label: 'Suggest writes',
    description: 'AI drafts changes and flags them for your approval before anything is written.',
  },
  {
    value: 'auto_routine',
    label: 'Auto routine',
    description: 'AI can run pre-approved routine operations (reminders, risk checks) autonomously.',
  },
  {
    value: 'full',
    label: 'Full autonomy',
    description: 'AI can read and write without per-action approval. Use with caution.',
  },
];

const ALLOWED_TOOLS: { key: string; label: string; description: string }[] = [
  { key: 'draft_page', label: 'Draft page', description: 'Create or edit notebook pages' },
  { key: 'update_iteration_status', label: 'Update iteration status', description: 'Change iteration status (planned/active/done)' },
  { key: 'create_reminder', label: 'Create reminder', description: 'Schedule reminders and events' },
  { key: 'flag_for_review', label: 'Flag for review', description: 'Flag samples/experiments for PI review' },
];

const MODE_PERMISSIVENESS: Record<AutonomyConfig['mode'], number> = {
  read_only: 0,
  suggest_writes: 1,
  auto_routine: 2,
  full: 3,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function modeMorePermissive(
  a: AutonomyConfig['mode'],
  b: AutonomyConfig['mode']
): boolean {
  return MODE_PERMISSIVENESS[a] > MODE_PERMISSIVENESS[b];
}

// ─── Autonomy form (shared between workspace and project scope) ───────────────

interface AutonomyFormProps {
  config: AutonomyConfig;
  wsConfig?: AutonomyConfig; // if project scope, the parent workspace config
  onSave: (mode: AutonomyConfig['mode'], allowedTools: string[]) => Promise<void>;
  saving: boolean;
  saveError?: string | null;
}

function AutonomyForm({ config, wsConfig, onSave, saving, saveError }: AutonomyFormProps) {
  const [mode, setMode] = useState<AutonomyConfig['mode']>(config.mode);
  const [allowedTools, setAllowedTools] = useState<Set<string>>(
    new Set(config.allowed_tools ?? [])
  );
  const [saved, setSaved] = useState(false);

  // Reset local state when remote config changes
  useEffect(() => {
    setMode(config.mode);
    setAllowedTools(new Set(config.allowed_tools ?? []));
  }, [config.mode, config.allowed_tools]);

  const toggleTool = (key: string) => {
    setAllowedTools(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    await onSave(mode, Array.from(allowedTools));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isDirty = mode !== config.mode ||
    JSON.stringify([...allowedTools].sort()) !== JSON.stringify([...(config.allowed_tools ?? [])].sort());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Mode selector */}
      <div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            marginBottom: 10,
          }}
        >
          Autonomy mode
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {AUTONOMY_MODES.map(m => {
            const blockedByWs = wsConfig && modeMorePermissive(m.value, wsConfig.mode);
            const selected = mode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => {
                  if (!blockedByWs) {
                    setMode(m.value);
                    setSaved(false);
                  }
                }}
                disabled={!!blockedByWs}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${selected ? 'var(--ember)' : 'var(--line)'}`,
                  background: selected ? 'var(--ember-tint)' : 'var(--surface)',
                  cursor: blockedByWs ? 'not-allowed' : 'default',
                  opacity: blockedByWs ? 0.5 : 1,
                  textAlign: 'left',
                  width: '100%',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Radio dot */}
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `2px solid ${selected ? 'var(--ember)' : 'var(--line-2)'}`,
                    background: selected ? 'var(--ember)' : 'var(--surface)',
                    flexShrink: 0,
                    marginTop: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#fff',
                      }}
                    />
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? 600 : 400,
                      color: selected ? 'var(--ember)' : 'var(--ink)',
                      marginBottom: 2,
                    }}
                  >
                    {m.label}
                    {blockedByWs && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10.5,
                          fontFamily: 'var(--mono)',
                          color: 'var(--muted-2)',
                          fontWeight: 400,
                        }}
                      >
                        (exceeds workspace cap)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                    {m.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {wsConfig && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              fontFamily: 'var(--mono)',
              color: 'var(--muted-2)',
            }}
          >
            Workspace cap: <strong style={{ color: 'var(--ink-2)' }}>{wsConfig.mode}</strong>
            {' '}— a project cannot exceed its workspace's permissiveness.
          </div>
        )}
      </div>

      {/* Allowed tools */}
      <div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            marginBottom: 8,
          }}
        >
          Allowed write tools
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALLOWED_TOOLS.map(t => {
            const checked = allowedTools.has(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleTool(t.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 7,
                  border: `1px solid ${checked ? 'var(--line-2)' : 'var(--line)'}`,
                  background: checked ? 'var(--paper-2)' : 'var(--surface)',
                  cursor: 'default',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                {/* Checkbox */}
                <div
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 4,
                    border: `1.5px solid ${checked ? 'var(--ember)' : 'var(--line-2)'}`,
                    background: checked ? 'var(--ember)' : 'var(--surface)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {checked && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: checked ? 500 : 400, color: 'var(--ink)' }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.3 }}>
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            fontFamily: 'var(--mono)',
            color: 'var(--muted-2)',
          }}
        >
          {allowedTools.size} tool{allowedTools.size !== 1 ? 's' : ''} enabled
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="top-btn primary"
          onClick={() => void handleSave()}
          disabled={saving || !isDirty}
          style={{ opacity: isDirty ? 1 : 0.5 }}
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </button>
        {saveError && (
          <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--bad)' }}>
            {saveError}
          </span>
        )}
        {saved && !saving && !saveError && (
          <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--good)' }}>
            Saved successfully
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Workspace autonomy section (for SettingsPage) ────────────────────────────

interface WorkspaceAutonomySectionProps {
  workspaceId: string;
}

export function WorkspaceAutonomySection({ workspaceId }: WorkspaceAutonomySectionProps) {
  const { data: config, isLoading, isError } = useWorkspaceAutonomy(workspaceId);
  const update = useUpdateWorkspaceAutonomy(workspaceId);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (isLoading) return <LoadingState message="Loading autonomy settings…" />;
  if (isError || !config) return <ErrorState message="Failed to load autonomy settings." />;

  const handleSave = async (mode: AutonomyConfig['mode'], allowedTools: string[]) => {
    setSaveError(null);
    try {
      await update.mutateAsync({ mode, allowed_tools: allowedTools });
    } catch (err) {
      setSaveError((err as Error).message ?? 'Save failed');
    }
  };

  return (
    <AutonomyForm
      config={config}
      onSave={handleSave}
      saving={update.isPending}
      saveError={saveError}
    />
  );
}

// ─── Project autonomy section (for ProjectDetailPage) ────────────────────────

interface ProjectAutonomySectionProps {
  projectId: string;
  workspaceId: string;
}

export function ProjectAutonomySection({ projectId, workspaceId }: ProjectAutonomySectionProps) {
  const { data: config, isLoading, isError } = useProjectAutonomy(projectId);
  const { data: wsConfig } = useWorkspaceAutonomy(workspaceId);
  const update = useUpdateProjectAutonomy(projectId);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (isLoading) return <LoadingState message="Loading AI settings…" />;
  if (isError || !config) return <ErrorState message="Failed to load AI settings." />;

  const handleSave = async (mode: AutonomyConfig['mode'], allowedTools: string[]) => {
    setSaveError(null);
    try {
      await update.mutateAsync({ mode, allowed_tools: allowedTools });
    } catch (err) {
      setSaveError((err as Error).message ?? 'Save failed');
    }
  };

  return (
    <AutonomyForm
      config={config}
      wsConfig={wsConfig}
      onSave={handleSave}
      saving={update.isPending}
      saveError={saveError}
    />
  );
}
