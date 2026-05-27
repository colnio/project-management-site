/**
 * LoginPage — pending/suspended approval gate tests.
 *
 * Tests that when the API returns 403 with auth.pending_approval or auth.suspended,
 * the error message is surfaced in the UI.
 *
 * Pattern: mock useAuth so login() rejects with an ApiError carrying the server
 * message (as the real client does when it gets a 403 response body).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../pages/LoginPage';

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) =>
    <a href={to as string} {...rest}>{children}</a>,
}));

// Mock useAuth so we can control login() outcomes.
const mockLogin = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    login: mockLogin,
    status: 'unauthenticated',
    user: null,
    logout: vi.fn(),
    register: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

describe('LoginPage — approval gate messages', () => {
  it('shows pending approval message when login returns 403 auth.pending_approval', async () => {
    const { ApiError } = await import('../api/client');
    mockLogin.mockRejectedValue(new ApiError(403, 'your account is awaiting approval'));

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('dev@graphene-lab.org'), 'pending@u.nus.edu');
    await user.type(screen.getByPlaceholderText('devpassword'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('your account is awaiting approval')).toBeInTheDocument();
    });
  });

  it('shows suspended message when login returns 403 auth.suspended', async () => {
    const { ApiError } = await import('../api/client');
    mockLogin.mockRejectedValue(new ApiError(403, 'your account has been suspended'));

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('dev@graphene-lab.org'), 'suspended@u.nus.edu');
    await user.type(screen.getByPlaceholderText('devpassword'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('your account has been suspended')).toBeInTheDocument();
    });
  });

  it('shows invalid credentials message for 401', async () => {
    const { ApiError } = await import('../api/client');
    mockLogin.mockRejectedValue(new ApiError(401, 'Invalid credentials'));

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('dev@graphene-lab.org'), 'bad@email.com');
    await user.type(screen.getByPlaceholderText('devpassword'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });
});
