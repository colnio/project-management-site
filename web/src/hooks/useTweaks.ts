/**
 * React hooks for per-user appearance preferences (see appearancePrefs.ts).
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  type OverviewLayout,
  type Theme,
  type Density,
  type FontFamily,
  OVERVIEW_LAYOUT_KEY,
  THEME_KEY,
  ACCENT_KEY,
  DENSITY_KEY,
  FONT_FAMILY_KEY,
  ACCENT_DEFAULTS,
  getOverviewLayout,
  setOverviewLayout,
  getTheme,
  applyTheme,
  getAccent,
  applyAccent,
  getDensity,
  applyDensity,
  getFontFamily,
  applyFontFamily,
  writeAppearancePref,
  applyAppearanceForUser,
  initTweaks,
} from '@/hooks/appearancePrefs';

export type { OverviewLayout, Theme, Density, FontFamily };
export {
  OVERVIEW_LAYOUT_KEY,
  THEME_KEY,
  ACCENT_KEY,
  DENSITY_KEY,
  FONT_FAMILY_KEY,
  ACCENT_DEFAULTS,
  getOverviewLayout,
  setOverviewLayout,
  getTheme,
  getAccent,
  getDensity,
  getFontFamily,
  applyAppearanceForUser,
  initTweaks,
};

export function useOverviewLayout(): [OverviewLayout, (l: OverviewLayout) => void] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [layout, setLayout] = useState<OverviewLayout>(() => getOverviewLayout(userId));

  useEffect(() => {
    setLayout(getOverviewLayout(userId));
  }, [userId]);

  const update = useCallback(
    (l: OverviewLayout) => {
      setOverviewLayout(l, userId);
      setLayout(l);
    },
    [userId],
  );

  return [layout, update];
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [theme, setThemeState] = useState<Theme>(() => getTheme(userId));

  useEffect(() => {
    const t = getTheme(userId);
    setThemeState(t);
    applyTheme(t);
  }, [userId]);

  const update = useCallback(
    (t: Theme) => {
      writeAppearancePref(userId, THEME_KEY, t);
      setThemeState(t);
      applyTheme(t);
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
