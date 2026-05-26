import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { configureClient, setAccessToken, getAccessToken } from '@/api/client';
import { api } from '@/api/client';
import type { User, LoginOutput, RefreshOutput } from '@/api/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const unauthorizedRef = useRef(false);

  // Called by the client on 401 after a failed refresh
  const handleUnauthorized = useCallback(() => {
    if (unauthorizedRef.current) return;
    unauthorizedRef.current = true;
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
    unauthorizedRef.current = false;
  }, []);

  // Attempt silent refresh using httpOnly cookie
  const attemptRefresh = useCallback(async (): Promise<string | null> => {
    try {
      const data = await api.post<RefreshOutput>('/v1/auth/refresh');
      setAccessToken(data.access_token);
      // Fetch the full user object
      const me = await api.get<User>('/v1/me');
      setUser(me);
      setStatus('authenticated');
      return data.access_token;
    } catch {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
      return null;
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

  // On mount, try to restore session from cookie
  useEffect(() => {
    attemptRefresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginOutput>('/v1/auth/login', {
      email,
      password,
    });
    setAccessToken(data.access_token);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/v1/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
