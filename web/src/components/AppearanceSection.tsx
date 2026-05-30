/**
 * User Settings → Appearance: density, accent, palette, fonts (per-user localStorage + server sync).
 */
import {
  useTheme,
  useAccent,
  useDensity,
  useFontFamily,
  usePalette,
  ACCENT_DEFAULTS,
  PALETTE_DEFAULTS,
  type Density,
  type FontFamily,
} from '@/hooks/useTweaks';
import { useAuth } from '@/hooks/useAuth';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          style={{
            flex: '1 1 auto',
            minWidth: 72,
            padding: '6px 10px',
            borderRadius: 5,
            fontSize: 12,
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

const DENSITY_OPTS: { id: Density; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'regular', label: 'Regular' },
  { id: 'comfy', label: 'Comfy' },
];

const FONT_OPTS: { id: FontFamily; label: string }[] = [
  { id: 'lab', label: 'Lab default' },
  { id: 'system', label: 'System' },
  { id: 'serif', label: 'Serif' },
];

const PALETTE_LABELS: Record<string, string> = {
  '--paper': 'Background',
  '--ink': 'Text',
  '--accent': 'Accent',
  '--good': 'Good',
  '--warn': 'Warning',
  '--bad': 'Error',
  '--info': 'Info',
};

function ColorRow({
  token,
  label,
  value,
  onChange,
}: {
  token: string;
  label: string;
  value: string;
  onChange: (token: string, val: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '5px 0',
      }}
    >
      <input
        type="color"
        value={value}
        onChange={e => onChange(token, e.target.value)}
        style={{
          width: 28,
          height: 28,
          borderRadius: 5,
          border: '1.5px solid var(--line-2)',
          padding: 2,
          background: 'var(--paper-2)',
          cursor: 'default',
          flexShrink: 0,
        }}
        title={token}
      />
      <span
        style={{
          fontSize: 12.5,
          color: 'var(--ink)',
          flex: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--muted)',
          letterSpacing: '0.02em',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function AppearanceSection() {
  const { user } = useAuth();
  const [theme] = useTheme();
  const [accent, setAccent] = useAccent();
  const [density, setDensity] = useDensity();
  const [font, setFont] = useFontFamily();
  const [palette, setPaletteToken, resetPalette] = usePalette(theme);

  // Resolve displayed color for a palette token. An explicit override wins; otherwise
  // read the *current theme's* computed value so the swatch reflects light vs dark.
  function resolvedColor(token: string): string {
    if (palette[token]) return palette[token];
    if (typeof window !== 'undefined') {
      const computed = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      if (computed) return computed;
    }
    return PALETTE_DEFAULTS[token] ?? '#000000';
  }

  const hasCustomPalette = Object.keys(palette).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
        Appearance is saved for your account on this device
        {user?.email ? ` (${user.email})` : ''}. Use the sun/moon control in the sidebar for light
        and dark mode.
      </p>

      <div>
        <FieldLabel>Density</FieldLabel>
        <Seg options={DENSITY_OPTS} value={density} onChange={setDensity} />
      </div>

      <div>
        <FieldLabel>Font</FieldLabel>
        <Seg options={FONT_OPTS} value={font} onChange={setFont} />
      </div>

      <div>
        <FieldLabel>Accent color</FieldLabel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {ACCENT_DEFAULTS.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => setAccent(color)}
              title={color}
              aria-label={`Accent ${color}`}
              aria-pressed={accent === color}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: color,
                border: `2px solid ${accent === color ? 'var(--ink)' : 'transparent'}`,
                boxShadow: accent === color ? '0 0 0 1px var(--ink)' : 'none',
                cursor: 'default',
                flexShrink: 0,
              }}
            />
          ))}
          {/* Custom accent via color picker */}
          <label
            title="Custom accent"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'default',
            }}
          >
            <input
              type="color"
              value={accent}
              onChange={e => setAccent(e.target.value)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: `2px solid ${ACCENT_DEFAULTS.includes(accent) ? 'var(--line-2)' : 'var(--ink)'}`,
                padding: 2,
                background: 'var(--paper-2)',
                cursor: 'default',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              custom
            </span>
          </label>
        </div>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <FieldLabel>Color palette · {theme} mode</FieldLabel>
          {hasCustomPalette && (
            <button
              type="button"
              onClick={resetPalette}
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                fontFamily: 'var(--mono)',
                padding: '2px 7px',
                borderRadius: 4,
                border: '1px solid var(--line)',
                background: 'var(--paper-2)',
                cursor: 'default',
                marginBottom: 8,
              }}
            >
              Reset to defaults
            </button>
          )}
        </div>
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: 'var(--paper-2)',
            padding: '4px 12px',
          }}
        >
          {Object.keys(PALETTE_DEFAULTS).map(token => (
            <ColorRow
              key={token}
              token={token}
              label={PALETTE_LABELS[token] ?? token}
              value={resolvedColor(token)}
              onChange={(tok, val) => setPaletteToken(tok, val)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
