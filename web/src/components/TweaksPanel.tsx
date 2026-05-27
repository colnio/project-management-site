/**
 * TweaksPanel — gear/tweaks slide-over (Phase 3)
 * Controls: layout, theme, accent, density, AI panel toggle, autonomy,
 * and project-tab jump links.
 */
import { useEffect } from 'react';
import {
  useOverviewLayout,
  useTheme,
  useAccent,
  useDensity,
  ACCENT_DEFAULTS,
  type OverviewLayout,
  type Density,
} from '@/hooks/useTweaks';
import {
  useProjectAutonomy,
  useUpdateProjectAutonomy,
  type AutonomyConfig,
} from '@/hooks/useAIQueries';

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--muted-2)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      padding: '12px 16px 4px',
    }}>
      {children}
    </div>
  );
}

// ─── Segment control ──────────────────────────────────────────────────────────

function Seg<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 16px' }}>
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 12,
            background: value === o.id ? 'var(--ink)' : 'var(--paper-2)',
            color: value === o.id ? 'var(--paper)' : 'var(--muted)',
            border: `1px solid ${value === o.id ? 'var(--ink)' : 'var(--line)'}`,
            cursor: 'default',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 36, height: 20, borderRadius: 99, padding: 2,
          background: value ? 'var(--ember)' : 'var(--line-2)',
          border: 0, cursor: 'default', position: 'relative',
          transition: 'background 0.15s',
        }}
      >
        <span style={{
          display: 'block', width: 16, height: 16, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transform: value ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.15s',
        }} />
      </button>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface TweaksPanelProps {
  onClose: () => void;
  onToggleAI?: () => void;
  aiPanelOpen?: boolean;
  projectId?: string;
  onJump?: (tab: string) => void;
}

const JUMP_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'iterations', label: 'Iterations' },
  { id: 'samples', label: 'Samples' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'pages', label: 'Notes / Pages' },
  { id: 'ai', label: 'AI Settings' },
];

const LAYOUT_OPTS: { id: OverviewLayout; label: string }[] = [
  { id: 'editorial', label: 'Editorial' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'stream', label: 'Stream' },
];

const DENSITY_OPTS: { id: Density; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'regular', label: 'Regular' },
  { id: 'comfy', label: 'Comfy' },
];

const AUTONOMY_MODES: { id: AutonomyConfig['mode']; label: string }[] = [
  { id: 'read_only', label: 'Read only' },
  { id: 'suggest_writes', label: 'Suggest writes' },
  { id: 'auto_routine', label: 'Auto routine' },
  { id: 'full', label: 'Full' },
];

export function TweaksPanel({ onClose, onToggleAI, aiPanelOpen, projectId, onJump }: TweaksPanelProps) {
  const [layout, setLayout] = useOverviewLayout();
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useAccent();
  const [density, setDensity] = useDensity();

  const { data: autonomy } = useProjectAutonomy(projectId);
  const updateAutonomy = useUpdateProjectAutonomy(projectId ?? '');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <style>{`
        .tweaks-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 300px; max-width: 92vw; background: var(--surface); border-left: 1px solid var(--line); display: flex; flex-direction: column; z-index: 300; box-shadow: -4px 0 24px rgba(20,18,14,0.12); overflow-y: auto; }
        .tweaks-head { padding: 14px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px; background: var(--paper); flex-shrink: 0; position: sticky; top: 0; z-index: 1; }
      `}</style>

      {/* Click-catcher backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={onClose} />

      <aside className="tweaks-panel">
        <div className="tweaks-head">
          <svg width={13} height={13} viewBox="0 0 16 16" fill="none" style={{ color: 'var(--muted)' }}>
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Tweaks</div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
        </div>

        {/* Overview Layout */}
        <SectionHead>Overview layout</SectionHead>
        <Seg options={LAYOUT_OPTS} value={layout} onChange={setLayout} />

        {/* Theme */}
        <SectionHead>Theme</SectionHead>
        <Seg
          options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
          value={theme}
          onChange={setTheme}
        />

        {/* Accent color */}
        <SectionHead>Accent color</SectionHead>
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px' }}>
          {ACCENT_DEFAULTS.map(color => (
            <button
              key={color}
              onClick={() => setAccent(color)}
              title={color}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: color, border: `2px solid ${accent === color ? 'var(--ink)' : 'transparent'}`,
                boxShadow: accent === color ? '0 0 0 1px var(--ink)' : 'none',
                cursor: 'default', flexShrink: 0,
              }}
            />
          ))}
        </div>

        {/* Density */}
        <SectionHead>Density</SectionHead>
        <Seg options={DENSITY_OPTS} value={density} onChange={setDensity} />

        {/* AI panel toggle */}
        {onToggleAI && (
          <>
            <SectionHead>Panels</SectionHead>
            <Toggle value={!!aiPanelOpen} onChange={() => onToggleAI()} label="AI Assistant" />
          </>
        )}

        {/* Autonomy */}
        {projectId && autonomy && (
          <>
            <SectionHead>AI autonomy mode</SectionHead>
            <div style={{ padding: '4px 16px 8px' }}>
              <select
                className="field-input"
                value={autonomy.mode}
                onChange={e => {
                  void updateAutonomy.mutate({
                    mode: e.target.value as AutonomyConfig['mode'],
                    allowed_tools: autonomy.allowed_tools ?? [],
                  });
                }}
                style={{ width: '100%', fontSize: 12.5 }}
              >
                {AUTONOMY_MODES.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Jump to tab */}
        {onJump && (
          <>
            <SectionHead>Jump to</SectionHead>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 12px 16px' }}>
              {JUMP_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onJump(t.id); onClose(); }}
                  style={{
                    textAlign: 'left', padding: '6px 8px', borderRadius: 5,
                    fontSize: 13, color: 'var(--ink-2)', cursor: 'default',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
