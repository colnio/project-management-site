/**
 * Tests for the API client's 401 → refresh → retry logic using MSW.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './setup';
import { configureClient, apiFetch, setAccessToken, ApiError } from '../api/client';

describe('apiFetch — 401 refresh logic', () => {
  const onRefresh = vi.fn();
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken('initial-token');
    configureClient({
      getToken: () => 'initial-token',
      onRefresh,
      onUnauthorized,
    });
  });

  it('returns JSON on a 200 response', async () => {
    server.use(
      http.get('/v1/test-endpoint', () =>
        HttpResponse.json({ ok: true })
      )
    );
    const result = await apiFetch<{ ok: boolean }>('/v1/test-endpoint');
    expect(result.ok).toBe(true);
  });

  it('retries once after 401 if refresh succeeds', async () => {
    let callCount = 0;
    onRefresh.mockResolvedValue('new-token');

    server.use(
      http.get('/v1/protected', () => {
        callCount++;
        if (callCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ data: 'secret' });
      })
    );

    const result = await apiFetch<{ data: string }>('/v1/protected');
    expect(result.data).toBe('secret');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(callCount).toBe(2);
  });

  it('calls onUnauthorized and throws if refresh fails', async () => {
    onRefresh.mockResolvedValue(null);

    server.use(
      http.get('/v1/protected-fail', () =>
        new HttpResponse(null, { status: 401 })
      )
    );

    await expect(apiFetch('/v1/protected-fail')).rejects.toBeInstanceOf(ApiError);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError with the status code on non-401 error', async () => {
    server.use(
      http.get('/v1/not-found', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 })
      )
    );

    try {
      await apiFetch('/v1/not-found');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
    }
  });
});
