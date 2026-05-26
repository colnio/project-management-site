/**
 * Typed fetch wrapper for the Graphene Lab API.
 * - Attaches Bearer token from memory (provided by AuthStore)
 * - On 401, attempts one silent token refresh then retries
 * - On second 401, clears auth state (caller should redirect to /login)
 */

let accessToken: string | null = null;
let refreshingPromise: Promise<string | null> | null = null;

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
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function doFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = authCallbacks.getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', 'application/json');

  return fetch(url, { ...init, headers });
}

export async function apiFetch<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  let response = await doFetch(url, init);

  // Do NOT run the refresh-retry for the refresh endpoint itself, otherwise
  // a failing refresh re-enters attemptRefresh and deadlocks on its own promise.
  if (response.status === 401 && !url.includes('/v1/auth/refresh')) {
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
  delete<T>(path: string): Promise<T> {
    return apiFetch<T>(path, { method: 'DELETE' });
  },
};
