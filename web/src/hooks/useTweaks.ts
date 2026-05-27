/**
 * useTweaks — lightweight localStorage-backed tweaks store.
 *
 * Phase 3 will add a full Tweaks panel that writes the same keys,
 * so keep the API stable: OVERVIEW_LAYOUT_KEY, getOverviewLayout,
 * setOverviewLayout, and the useOverviewLayout hook.
 */

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

import { useState, useCallback } from 'react';

export function useOverviewLayout(): [OverviewLayout, (l: OverviewLayout) => void] {
  const [layout, setLayout] = useState<OverviewLayout>(getOverviewLayout);

  const update = useCallback((l: OverviewLayout) => {
    setOverviewLayout(l);
    setLayout(l);
  }, []);

  return [layout, update];
}
