/**
 * React hooks for per-user appearance preferences (see appearancePrefs.ts).
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  type Theme,
  type Density,
  type FontFamily,
  type PaletteOverrides,
  THEME_KEY,
  ACCENT_KEY,
  DENSITY_KEY,
  FONT_FAMILY_KEY,
  ACCENT_DEFAULTS,
  PALETTE_DEFAULTS,
  getTheme,
  applyTheme,
  getAccent,
  applyAccent,
  getDensity,
  applyDensity,
  getFontFamily,
  applyFontFamily,
  getPalette,
  savePalette,
  applyPalette,
  applyPaletteForTheme,
  writeAppearancePref,
  applyAppearanceForUser,
  initTweaks,
} from '@/hooks/appearancePrefs';

export type { Theme, Density, FontFamily, PaletteOverrides };
export {
  THEME_KEY,
  ACCENT_KEY,
  DENSITY_KEY,
  FONT_FAMILY_KEY,
  ACCENT_DEFAULTS,
  PALETTE_DEFAULTS,
  getTheme,
  getAccent,
  getDensity,
  getFontFamily,
  getPalette,
  applyAppearanceForUser,
  initTweaks,
};

export function useTheme(): [Theme, (t: Theme) => void] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [theme, setThemeState] = useState<Theme>(() => getTheme(userId));

  useEffect(() => {
    const t = getTheme(userId);
    setThemeState(t);
    applyTheme(t);
    applyPaletteForTheme(userId, t);
  }, [userId]);

  const update = useCallback(
    (t: Theme) => {
      writeAppearancePref(userId, THEME_KEY, t);
      setThemeState(t);
      applyTheme(t);
      // Re-apply the palette scoped to the new theme so overrides don't leak across themes.
      applyPaletteForTheme(userId, t);
    },
    [userId],
  );

  return [theme, update];
}

export function useAccent(): [string, (a: string) => void] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [accent, setAccentState] = useState<string>(() => getAccent(userId));

  useEffect(() => {
    const a = getAccent(userId);
    setAccentState(a);
    applyAccent(a);
  }, [userId]);

  const update = useCallback(
    (a: string) => {
      writeAppearancePref(userId, ACCENT_KEY, a);
      setAccentState(a);
      applyAccent(a);
    },
    [userId],
  );

  return [accent, update];
}

export function useDensity(): [Density, (d: Density) => void] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [density, setDensityState] = useState<Density>(() => getDensity(userId));

  useEffect(() => {
    const d = getDensity(userId);
    setDensityState(d);
    applyDensity(d);
  }, [userId]);

  const update = useCallback(
    (d: Density) => {
      writeAppearancePref(userId, DENSITY_KEY, d);
      setDensityState(d);
      applyDensity(d);
    },
    [userId],
  );

  return [density, update];
}

export function useFontFamily(): [FontFamily, (f: FontFamily) => void] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [font, setFontState] = useState<FontFamily>(() => getFontFamily(userId));

  useEffect(() => {
    const f = getFontFamily(userId);
    setFontState(f);
    applyFontFamily(f);
  }, [userId]);

  const update = useCallback(
    (f: FontFamily) => {
      writeAppearancePref(userId, FONT_FAMILY_KEY, f);
      setFontState(f);
      applyFontFamily(f);
    },
    [userId],
  );

  return [font, update];
}

/**
 * Palette overrides for a specific theme. Pass the currently active theme so edits
 * are scoped to it (a light-mode background must not bleed into dark mode).
 */
export function usePalette(theme: Theme): [
  PaletteOverrides,
  (token: string, value: string) => void,
  () => void,
] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [overrides, setOverrides] = useState<PaletteOverrides>(() => getPalette(userId, theme));

  useEffect(() => {
    const p = getPalette(userId, theme);
    setOverrides(p);
    applyPalette(p);
  }, [userId, theme]);

  const setToken = useCallback(
    (token: string, value: string) => {
      setOverrides(prev => {
        const next = { ...prev, [token]: value };
        savePalette(userId, theme, next);
        applyPalette(next);
        return next;
      });
    },
    [userId, theme],
  );

  const reset = useCallback(() => {
    savePalette(userId, theme, {});
    applyPalette({});
    setOverrides({});
  }, [userId, theme]);

  return [overrides, setToken, reset];
}
