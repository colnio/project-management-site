import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { configureClient, setAccessToken, getAccessToken, forceAuthExit, ApiError } from '@/api/client';
import { api } from '@/api/client';
import type { User, LoginOutput, RefreshOutput, RegisterOutput } from '@/api/types';
import { applyAppearanceForUser } from '@/hooks/appearancePrefs';

// ─── Types ───────────────────────────────────────────────────────────────────

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, passwordConfirm: string) => Promise<RegisterOutput>;
  /** Re-fetch /v1/me and update the user in state — used after profile setup */
  refreshUser: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ─── Bootstrap dedup ─────────────────────────────────────────────────────────
//
// React StrictMode double-mounts components in dev, so the mount effect in
// AuthProvider runs twice before the first invocation completes. The refresh
// token is single-use (the backend rotates it atomically), so the second call
// would receive a 401 and navigate to /login. We deduplicate at the module
// level: the first call captures the in-flight promise; the second returns it
// directly. The promise is cleared in `.finally` so subsequent (real) refresh
// calls — e.g. after a token rotation — start fresh.
let bootstrapPromise: Promise<string | null> | null = null;

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const unauthorizedRef = useRef(false);

  // Called by the client on 401 after a failed refresh
  const handleUnauthorized = useCallback(() => {
    if (unauthorizedRef.current) return;
    unauthorizedRef.current = true;
    forceAuthExit();
  }, []);

  // Attempt silent refresh using httpOnly cookie.
  // Uses the module-level bootstrapPromise to deduplicate concurrent calls
  // (e.g. from React StrictMode's double-mount in development).
  const attemptRefresh = useCallback(async (): Promise<string | null> => {
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      try {
        const data = await api.post<RefreshOutput>('/v1/auth/refresh');
        setAccessToken(data.access_token);
        // Fetch the full user object
        const me = await api.get<User>('/v1/me');
        setUser(me);
        applyAppearanceForUser(me.id);
        setStatus('authenticated');
        return data.access_token;
      } catch {
        setAccessToken(null);
        setUser(null);
        const path = window.location.pathname;
        if (path !== '/login' && path !== '/register') {
          forceAuthExit();
          return null;
        }
        setStatus('unauthenticated');
        return null;
      }
    })();
    try {
      return await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  }, []);

  // Configure the API client with auth callbacks
  useEffect(() => {
    configureClient({
      getToken: getAccessToken,
      onRefresh: attemptRefresh,
      onUnauthorized: handleUnauthorized,
    });
  }, [attemptRefresh, handleUnauthorized]);

  // On mount, restore the session. If this tab already has an access token
  // (mirrored in sessionStorage), reuse it: validate via /me, and let the API
  // client transparently refresh once if it has expired. Only when there is no
  // stored token do we refresh up front. This avoids refreshing — and thus
  // rotating the refresh token — on every page load, which previously raced and
  // bounced long sessions to /login.
  useEffect(() => {
    if (getAccessToken()) {
      api.get<User>('/v1/me')
        .then(me => {
          setUser(me);
          applyAppearanceForUser(me.id);
          setStatus('authenticated');
        })
        .catch(err => {
          // A non-401 failure (e.g. network) shouldn't strand us in 'loading';
          // fall back to a cookie refresh. 401s are already handled by the
          // client (it refreshed+retried, or redirected via onUnauthorized).
          if (!(err instanceof ApiError) || err.status !== 401) {
            void attemptRefresh();
          }
        });
    } else {
      void attemptRefresh();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginOutput>('/v1/auth/login', {
      email,
      password,
    });
    setAccessToken(data.access_token);
    setUser(data.user);
    applyAppearanceForUser(data.user.id);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/v1/auth/logout');
    } finally {
      forceAuthExit();
    }
  }, []);

  const register = useCallback(async (
    email: string,
    password: string,
    passwordConfirm: string,
  ): Promise<RegisterOutput> => {
    return api.post<RegisterOutput>('/v1/auth/register', {
      email,
      password,
      password_confirm: passwordConfirm,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api.get<User>('/v1/me');
    setUser(me);
    applyAppearanceForUser(me.id);
  }, []);

  useEffect(() => {
    if (user?.id) {
      applyAppearanceForUser(user.id);
    }
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ status, user, login, logout, register, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
