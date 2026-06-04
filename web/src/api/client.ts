/**
 * Typed fetch wrapper for the Graphene Lab API.
 * - Attaches Bearer token from memory (provided by AuthStore)
 * - On 401, attempts one silent token refresh then retries
 * - On second 401, clears auth state (caller should redirect to /login)
 */

// The access token is kept in memory and mirrored to sessionStorage so a full
// page reload (or client navigation that remounts the app) can reuse a still-
// valid token instead of forcing a refresh on every load. Refreshing on every
// load is what made sessions fragile: the backend rotates the refresh token on
// each refresh, so frequent/concurrent refreshes raced and revoked each other,
// bouncing the user to /login. Reusing the stored token until it actually 401s
// (then refreshing once) avoids that. sessionStorage (not localStorage) scopes
// it to the tab and clears on close; it is no more exposed than the in-memory
// copy already is.
const ACCESS_TOKEN_KEY = 'gl_access_token';

function loadStoredToken(): string | null {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

let accessToken: string | null = loadStoredToken();
let refreshingPromise: Promise<string | null> | null = null;

// Auth endpoints that should never trigger the 401→refresh→retry loop.
// Login and register return 401 for bad credentials — treating that as an
// expired session would silently reload the page and wipe the error state.
const AUTH_ENDPOINTS_NO_RETRY = ['/v1/auth/refresh', '/v1/auth/login', '/v1/auth/register'];
function shouldSkipRefreshRetry(url: string): boolean {
  return AUTH_ENDPOINTS_NO_RETRY.some(p => url.includes(p));
}

// Callbacks registered by auth context
type AuthCallbacks = {
  getToken: () => string | null;
  onRefresh: () => Promise<string | null>;
  onUnauthorized: () => void;
};

let authCallbacks: AuthCallbacks = {
  getToken: () => null,
  onRefresh: async () => null,
  onUnauthorized: () => {},
};

export function configureClient(callbacks: AuthCallbacks) {
  authCallbacks = callbacks;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  try {
    if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // sessionStorage unavailable (e.g. private mode) — in-memory still works.
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Clear in-memory auth and hard-navigate so route guards re-run (logout / expired session). */
export function forceAuthExit(): void {
  setAccessToken(null);
  const path = window.location.pathname;
  if (path === '/login' || path === '/register') {
    window.location.reload();
    return;
  }
  window.location.replace('/login');
}

async function doFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = authCallbacks.getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...init, headers });
}

/** Like apiFetch but returns the raw Response (for ETag headers, SSE streams, etc.). */
export async function apiFetchRaw(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  let response = await doFetch(url, init);

  if (response.status === 401 && !shouldSkipRefreshRetry(url)) {
    if (!refreshingPromise) {
      refreshingPromise = authCallbacks.onRefresh().finally(() => {
        refreshingPromise = null;
      });
    }
    const newToken = await refreshingPromise;

    if (newToken) {
      response = await doFetch(url, init);
    }

    if (response.status === 401) {
      authCallbacks.onUnauthorized();
      throw new ApiError(401, 'Unauthorized');
    }
  }

  return response;
}

export async function apiFetch<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  let response = await doFetch(url, init);

  // Do NOT run the refresh-retry for auth endpoints (refresh, login, register).
  // Login/register return 401 for bad credentials — we must surface those as
  // real errors, not silently reload the page via the session-expiry path.
  if (response.status === 401 && !shouldSkipRefreshRetry(url)) {
    // Attempt a single refresh
    if (!refreshingPromise) {
      refreshingPromise = authCallbacks.onRefresh().finally(() => {
        refreshingPromise = null;
      });
    }
    const newToken = await refreshingPromise;

    if (newToken) {
      // Retry with fresh token
      response = await doFetch(url, init);
    }

    if (response.status === 401) {
      authCallbacks.onUnauthorized();
      throw new ApiError(401, 'Unauthorized');
    }
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.detail ?? body.message ?? message;
    } catch {}
    throw new ApiError(response.status, message);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Convenience methods
export const api = {
  get<T>(path: string): Promise<T> {
    return apiFetch<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  delete<T>(path: string): Promise<T> {
    return apiFetch<T>(path, { method: 'DELETE' });
  },
};
