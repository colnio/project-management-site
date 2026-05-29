/**
 * Per-user appearance preference storage and DOM application (no React hooks).
 */

export type OverviewLayout = 'editorial' | 'dashboard' | 'stream';
export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'regular' | 'comfy';
export type FontFamily = 'lab' | 'system' | 'serif';

export const OVERVIEW_LAYOUT_KEY = 'overviewLayout';
export const THEME_KEY = 'theme';
export const ACCENT_KEY = 'accent';
export const DENSITY_KEY = 'density';
export const FONT_FAMILY_KEY = 'fontFamily';

export const ACCENT_DEFAULTS = [
  '#d97757',
  '#5a7d3a',
  '#5a6a8a',
  '#7a5a8a',
  '#b5841b',
];

const ACTIVE_USER_KEY = 'appearance.activeUserId';

const FONT_PRESETS: Record<FontFamily, { sans: string; serif: string; mono: string }> = {
  lab: {
    sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    serif: '"Libre Baskerville", ui-serif, Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, "SF Mono", monospace',
  },
  system: {
    sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    serif: 'ui-serif, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
  },
  serif: {
    sans: '"Libre Baskerville", ui-serif, Georgia, serif',
    serif: '"Libre Baskerville", ui-serif, Georgia, serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
  },
};

function scopedKey(userId: string | null, name: string): string {
  const id = userId ?? 'guest';
  return `appearance.${id}.${name}`;
}

function readStored<T>(
  userId: string | null,
  name: string,
  parse: (raw: string) => T | null,
  fallback: T,
): T {
  try {
    const scoped = localStorage.getItem(scopedKey(userId, name));
    if (scoped != null) {
      const v = parse(scoped);
      if (v != null) return v;
    }
    const legacy = localStorage.getItem(`tweaks.${name}`);
    if (legacy != null) {
      const v = parse(legacy);
      if (v != null) return v;
    }
  } catch {
    // localStorage unavailable
  }
  return fallback;
}

export function writeAppearancePref(userId: string | null, name: string, value: string): void {
  try {
    localStorage.setItem(scopedKey(userId, name), value);
    if (userId) {
      localStorage.setItem(ACTIVE_USER_KEY, userId);
    }
  } catch {
    // ignore
  }
}

export function getOverviewLayout(userId?: string | null): OverviewLayout {
  return readStored(
    userId ?? null,
    OVERVIEW_LAYOUT_KEY,
    v => (v === 'editorial' || v === 'dashboard' || v === 'stream' ? v : null),
    'dashboard',
  );
}

export function setOverviewLayout(layout: OverviewLayout, userId?: string | null): void {
  writeAppearancePref(userId ?? null, OVERVIEW_LAYOUT_KEY, layout);
}

export function getTheme(userId?: string | null): Theme {
  return readStored(userId ?? null, THEME_KEY, v => (v === 'light' || v === 'dark' ? v : null), 'light');
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function getAccent(userId?: string | null): string {
  return readStored(userId ?? null, ACCENT_KEY, v => (v ? v : null), ACCENT_DEFAULTS[0]);
}

export function applyAccent(color: string) {
  document.documentElement.style.setProperty('--accent', color);
}

export function getDensity(userId?: string | null): Density {
  return readStored(
    userId ?? null,
    DENSITY_KEY,
    v => (v === 'compact' || v === 'regular' || v === 'comfy' ? v : null),
    'regular',
  );
}

export function applyDensity(density: Density) {
  document.documentElement.dataset.density = density;
}

export function getFontFamily(userId?: string | null): FontFamily {
  return readStored(
    userId ?? null,
    FONT_FAMILY_KEY,
    v => (v === 'lab' || v === 'system' || v === 'serif' ? v : null),
    'lab',
  );
}

export function applyFontFamily(font: FontFamily) {
  const preset = FONT_PRESETS[font];
  document.documentElement.style.setProperty('--sans', preset.sans);
  document.documentElement.style.setProperty('--serif', preset.serif);
  document.documentElement.style.setProperty('--mono', preset.mono);
  document.documentElement.dataset.font = font;
}

function resolveBootUserId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_USER_KEY);
  } catch {
    return null;
  }
}

export function applyAppearanceForUser(userId: string | null) {
  applyTheme(getTheme(userId));
  applyAccent(getAccent(userId));
  applyDensity(getDensity(userId));
  applyFontFamily(getFontFamily(userId));
  if (userId) {
    try {
      localStorage.setItem(ACTIVE_USER_KEY, userId);
    } catch {
      // ignore
    }
  }
}

export function initTweaks() {
  applyAppearanceForUser(resolveBootUserId());
}
