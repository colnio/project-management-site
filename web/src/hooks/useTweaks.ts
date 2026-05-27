/**
 * useTweaks — lightweight localStorage-backed tweaks store.
 *
 * Stable exports: OVERVIEW_LAYOUT_KEY, getOverviewLayout,
 * setOverviewLayout, useOverviewLayout.
 * Phase 3 additions: useTheme, useAccent, useDensity.
 */

import { useState, useCallback, useEffect } from 'react';

// ─── Overview Layout ──────────────────────────────────────────────────────────

export type OverviewLayout = 'editorial' | 'dashboard' | 'stream';

export const OVERVIEW_LAYOUT_KEY = 'tweaks.overviewLayout';

export function getOverviewLayout(): OverviewLayout {
  try {
    const v = localStorage.getItem(OVERVIEW_LAYOUT_KEY);
    if (v === 'editorial' || v === 'dashboard' || v === 'stream') return v;
  } catch {
    // localStorage unavailable
  }
  return 'dashboard';
}

export function setOverviewLayout(layout: OverviewLayout): void {
  try {
    localStorage.setItem(OVERVIEW_LAYOUT_KEY, layout);
  } catch {
    // ignore
  }
}

export function useOverviewLayout(): [OverviewLayout, (l: OverviewLayout) => void] {
  const [layout, setLayout] = useState<OverviewLayout>(getOverviewLayout);

  const update = useCallback((l: OverviewLayout) => {
    setOverviewLayout(l);
    setLayout(l);
  }, []);

  return [layout, update];
}

// ─── Theme ────────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'tweaks.theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* ignore */ }
  return 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const update = useCallback((t: Theme) => {
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
    setTheme(t);
    applyTheme(t);
  }, []);

  return [theme, update];
}

// ─── Accent Color ─────────────────────────────────────────────────────────────

export const ACCENT_KEY = 'tweaks.accent';
export const ACCENT_DEFAULTS = [
  '#d97757', // ember (default)
  '#5a7d3a', // green
  '#5a6a8a', // slate
  '#7a5a8a', // violet
  '#b5841b', // amber
];

export function getAccent(): string {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    if (v) return v;
  } catch { /* ignore */ }
  return ACCENT_DEFAULTS[0];
}

function applyAccent(color: string) {
  document.documentElement.style.setProperty('--accent', color);
}

export function useAccent(): [string, (a: string) => void] {
  const [accent, setAccent] = useState<string>(getAccent);

  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  const update = useCallback((a: string) => {
    try { localStorage.setItem(ACCENT_KEY, a); } catch { /* ignore */ }
    setAccent(a);
    applyAccent(a);
  }, []);

  return [accent, update];
}

// ─── Density ─────────────────────────────────────────────────────────────────

export type Density = 'compact' | 'regular' | 'comfy';

export const DENSITY_KEY = 'tweaks.density';

export function getDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === 'compact' || v === 'regular' || v === 'comfy') return v;
  } catch { /* ignore */ }
  return 'regular';
}

function applyDensity(density: Density) {
  document.documentElement.dataset.density = density;
}

export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>(getDensity);

  useEffect(() => {
    applyDensity(density);
  }, [density]);

  const update = useCallback((d: Density) => {
    try { localStorage.setItem(DENSITY_KEY, d); } catch { /* ignore */ }
    setDensity(d);
    applyDensity(d);
  }, []);

  return [density, update];
}

// ─── Init (call once at app boot) ────────────────────────────────────────────

export function initTweaks() {
  applyTheme(getTheme());
  applyAccent(getAccent());
  applyDensity(getDensity());
}
