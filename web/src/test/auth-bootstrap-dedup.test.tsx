/**
 * Verifies that the module-level bootstrapPromise in useAuth.tsx deduplicates
 * concurrent attemptRefresh calls that occur because React StrictMode
 * double-mounts components in development.
 *
 * The test renders <AuthProvider> wrapped in <StrictMode> and asserts that
 * only one POST /v1/auth/refresh network request is made despite two mounts.
 */
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from './setup';
import { AuthProvider } from '../hooks/useAuth';
import { configureClient, setAccessToken } from '../api/client';

describe('AuthProvider bootstrap dedup (StrictMode)', () => {
  beforeEach(() => {
    setAccessToken(null);
    // Reset client callbacks to no-ops so the refresh path in client.ts
    // doesn't interfere with our observation
    configureClient({
      getToken: () => null,
      onRefresh: vi.fn().mockResolvedValue(null),
      onUnauthorized: vi.fn(),
    });
  });

  it('calls /v1/auth/refresh exactly once even under StrictMode double-mount', async () => {
    let refreshCallCount = 0;

    server.use(
      http.post('/v1/auth/refresh', () => {
        refreshCallCount++;
        // Return a valid token so the full happy-path runs (also hits /v1/me)
        return HttpResponse.json({ access_token: 'tok-bootstrap' });
      })
    );

    // Render with StrictMode — in development this double-invokes effects,
    // which would call attemptRefresh twice without the dedup guard.
    render(
      <StrictMode>
        <AuthProvider>
          <div data-testid="child" />
        </AuthProvider>
      </StrictMode>
    );

    // Wait long enough for all async effects to settle
    await waitFor(() => {
      expect(refreshCallCount).toBeGreaterThanOrEqual(1);
    });

    expect(refreshCallCount).toBe(1);
  });
});
