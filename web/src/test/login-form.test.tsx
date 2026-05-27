/**
 * Login form rendering and submit tests.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../pages/LoginPage';

// Mock TanStack Router's useNavigate + Link
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) =>
    <a href={to as string} {...rest}>{children}</a>,
}));

// Mock useAuth
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

describe('LoginPage', () => {
  it('renders email and password fields with placeholder text', () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText('dev@graphene-lab.org')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('devpassword')).toBeInTheDocument();
  });

  it('renders the sign-in button', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('calls login with email and password on submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('dev@graphene-lab.org'), 'dev@graphene-lab.org');
    await user.type(screen.getByPlaceholderText('devpassword'), 'devpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('dev@graphene-lab.org', 'devpassword');
    });
  });

  it('shows error message when login fails', async () => {
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

  it('disables the button while loading', async () => {
    let resolve: () => void = () => {};
    mockLogin.mockReturnValue(new Promise<void>(r => { resolve = r; }));

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('dev@graphene-lab.org'), 'dev@graphene-lab.org');
    await user.type(screen.getByPlaceholderText('devpassword'), 'devpassword');

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });

    // Wrap resolve() in act so the setLoading(false) state update that fires
    // when the promise resolves is properly flushed inside React's scheduler —
    // this eliminates the "not wrapped in act(...)" warning.
    await act(async () => {
      resolve();
    });
  });
});
