/**
 * Sync appearance prefs to/from /v1/me/appearance.
 *
 * Boot flow:
 *  1. localStorage is applied synchronously in initTweaks() before React renders (no flash).
 *  2. On auth, this hook fetches server prefs and merges them into localStorage + re-applies
 *     (server is source of truth when present).
 *
 * Write flow:
 *  - Callers write localStorage immediately (fast, no flicker).
 *  - This hook watches for a "flush" signal and PATCHes the full prefs blob to the server.
 *
 * Guests (no userId) use localStorage-only; no API calls are made.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import {
  getTheme,
  getAccent,
  getDensity,
  getFontFamily,
  getPalette,
  applyAppearanceForUser,
  writeAppearancePref,
  savePalette,
  setAppearanceChangeListener,
  runWithoutAppearanceSync,
  THEME_KEY,
  ACCENT_KEY,
  DENSITY_KEY,
  FONT_FAMILY_KEY,
} from '@/hooks/appearancePrefs';

type PaletteMap = Record<string, string>;

interface ServerPrefs {
  theme?: string;
  density?: string;
  fontFamily?: string;
  accent?: string;
  // Per-theme palette overrides; a flat map is accepted for back-compat (treated as light).
  palette?: { light?: PaletteMap; dark?: PaletteMap } | PaletteMap;
}

interface AppearanceResponse {
  prefs: ServerPrefs;
}

export const appearanceSyncKeys = {
  all: ['me', 'appearance'] as const,
};

/** Assemble full prefs blob from localStorage for the given userId. */
function buildPrefsBlob(userId: string): ServerPrefs {
  return {
    theme: getTheme(userId),
    density: getDensity(userId),
    fontFamily: getFontFamily(userId),
    accent: getAccent(userId),
    palette: {
      light: getPalette(userId, 'light'),
      dark: getPalette(userId, 'dark'),
    },
  };
}

/** Merge server prefs into localStorage + apply to DOM (without re-triggering a server push). */
function mergeServerPrefs(userId: string, serverPrefs: ServerPrefs): void {
  runWithoutAppearanceSync(() => {
    if (serverPrefs.theme === 'light' || serverPrefs.theme === 'dark') {
      writeAppearancePref(userId, THEME_KEY, serverPrefs.theme);
    }
    if (serverPrefs.density === 'compact' || serverPrefs.density === 'regular' || serverPrefs.density === 'comfy') {
      writeAppearancePref(userId, DENSITY_KEY, serverPrefs.density);
    }
    if (serverPrefs.fontFamily === 'lab' || serverPrefs.fontFamily === 'system' || serverPrefs.fontFamily === 'serif') {
      writeAppearancePref(userId, FONT_FAMILY_KEY, serverPrefs.fontFamily);
    }
    if (serverPrefs.accent && typeof serverPrefs.accent === 'string') {
      writeAppearancePref(userId, ACCENT_KEY, serverPrefs.accent);
    }
    const pal = serverPrefs.palette;
    if (pal && typeof pal === 'object') {
      if ('light' in pal || 'dark' in pal) {
        const nested = pal as { light?: PaletteMap; dark?: PaletteMap };
        if (nested.light) savePalette(userId, 'light', nested.light);
        if (nested.dark) savePalette(userId, 'dark', nested.dark);
      } else {
        // Back-compat: old flat palette blob → treat as the light-theme overrides.
        savePalette(userId, 'light', pal as PaletteMap);
      }
    }
  });
  applyAppearanceForUser(userId);
}

/**
 * useAppearanceSync wires GET/PATCH /v1/me/appearance.
 *
 * Call this once at the app root (below AuthProvider and QueryClientProvider).
 * After authentication completes, it will:
 *   1. Fetch server prefs and merge into localStorage.
 *   2. Expose `syncToServer()` which should be called after any local pref change.
 */
export function useAppearanceSync(): { syncToServer: () => void } {
  const { user, status } = useAuth();
  const userId = user?.id ?? null;

  // Fetch server prefs when the user is authenticated.
  const { data: serverPrefs } = useQuery({
    queryKey: [...appearanceSyncKeys.all, userId],
    queryFn: async () => {
      const data = await api.get<AppearanceResponse>('/v1/me/appearance');
      return data.prefs ?? {};
    },
    enabled: status === 'authenticated' && userId !== null,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Merge server prefs into localStorage + DOM once they arrive (React Query v5 has no
  // onSuccess on useQuery, so reconcile via effect). The merge is echo-suppressed, so it
  // does not bounce back to the server.
  useEffect(() => {
    if (userId && serverPrefs) {
      mergeServerPrefs(userId, serverPrefs as ServerPrefs);
    }
  }, [userId, serverPrefs]);

  const mutation = useMutation({
    mutationFn: (prefs: ServerPrefs) =>
      api.patch<{ ok: boolean }>('/v1/me/appearance', { prefs }),
  });
  // Keep a stable ref to mutate so the change listener doesn't churn on every render.
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;

  // Debounce ref: we schedule a flush 600ms after the last pref change.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncToServer = useCallback(() => {
    if (!userId) return;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      mutateRef.current(buildPrefsBlob(userId));
    }, 600);
  }, [userId]);

  // Register the single global change listener so every local appearance write flushes.
  useEffect(() => {
    setAppearanceChangeListener(syncToServer);
    return () => {
      setAppearanceChangeListener(null);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [syncToServer]);

  return { syncToServer };
}
