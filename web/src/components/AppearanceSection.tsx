/**
 * User Settings → Appearance: layout, density, accent, fonts (per-user localStorage).
 */
import {
  useOverviewLayout,
  useAccent,
  useDensity,
  useFontFamily,
  ACCENT_DEFAULTS,
  type OverviewLayout,
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

const FONT_OPTS: { id: FontFamily; label: string }[] = [
  { id: 'lab', label: 'Lab default' },
  { id: 'system', label: 'System' },
  { id: 'serif', label: 'Serif' },
];

export function AppearanceSection() {
  const { user } = useAuth();
  const [layout, setLayout] = useOverviewLayout();
  const [accent, setAccent] = useAccent();
  const [density, setDensity] = useDensity();
  const [font, setFont] = useFontFamily();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
        Appearance is saved for your account on this device
        {user?.email ? ` (${user.email})` : ''}. Use the sun/moon control in the sidebar for light
        and dark mode.
      </p>

      <div>
        <FieldLabel>Overview layout</FieldLabel>
        <Seg options={LAYOUT_OPTS} value={layout} onChange={setLayout} />
      </div>

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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
        </div>
      </div>
    </div>
  );
}
