/**
 * Verifies that a 401 from /v1/auth/login surfaces an error message in the
 * LoginPage UI instead of silently reloading the page.
 *
 * This test goes through the real apiFetch client (not a mocked useAuth.login)
 * to confirm that the shouldSkipRefreshRetry guard prevents the 401→reload path.
 * MSW intercepts the /v1/auth/login request and returns a 401 with a JSON body.
 *
 * NOTE: do NOT call vi.stubGlobal('location', ...) in this test — replacing
 * window.location with a plain object strips the `origin` that jsdom's fetch
 * needs to resolve relative URLs, causing a TypeError before MSW can intercept.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from './setup';
import { LoginPage } from '../pages/LoginPage';
import { configureClient, setAccessToken, api } from '../api/client';

// Mock TanStack Router's useNavigate + Link
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) =>
    <a href={to as string} {...rest}>{children}</a>,
}));

// Provide a minimal useAuth mock whose `login` delegates to the real api.post
// so the client.ts 401-handling code is exercised end-to-end.
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    logout: vi.fn(),
    register: vi.fn(),
    refreshUser: vi.fn(),
    login: (email: string, password: string) =>
      api.post('/v1/auth/login', { email, password }),
  }),
}));

describe('LoginPage — real apiFetch 401 path', () => {
  beforeEach(() => {
    setAccessToken(null);
    configureClient({
      getToken: () => null,
      onRefresh: vi.fn().mockResolvedValue(null),
      onUnauthorized: vi.fn(),
    });
  });

  it('shows the server error message on 401 without reloading the page', async () => {
    server.use(
      http.post('/v1/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 })
      )
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('dev@graphene-lab.org'), 'bad@test.com');
    await user.type(screen.getByPlaceholderText('devpassword'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // The error message from the server body must appear in the UI
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });
});
