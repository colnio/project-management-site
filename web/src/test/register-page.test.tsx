/**
 * RegisterPage tests — submitting shows awaiting-approval panel on success;
 * client-side password mismatch shows inline error.
 *
 * Follows the same pattern as login-form.test.tsx: mock useAuth + TanStack router,
 * rely on the MSW handler for POST /v1/auth/register.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterPage } from '../pages/RegisterPage';

// Mock TanStack Router's Link
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) =>
    <a href={to as string} {...rest}>{children}</a>,
}));

// Mock useAuth — wire `register` to the real API call via a spy so we can control it.
const mockRegister = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    register: mockRegister,
    status: 'unauthenticated',
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

describe('RegisterPage', () => {
  it('renders email, password, and confirm-password fields', () => {
    render(<RegisterPage />);
    expect(screen.getByPlaceholderText('e1234567@u.nus.edu')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Repeat your password')).toBeInTheDocument();
  });

  it('renders the "Request access" submit button', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('button', { name: /request access/i })).toBeInTheDocument();
  });

  it('shows awaiting-approval panel after successful registration', async () => {
    // Simulate a successful register call (status 201, no token).
    mockRegister.mockResolvedValue({ status: 'pending', message: 'Your account is awaiting approval.' });

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByPlaceholderText('e1234567@u.nus.edu'), 'x@u.nus.edu');
    await user.type(screen.getByPlaceholderText('At least 8 characters'), 'password123');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /request access/i }));

    await waitFor(() => {
      // The success panel contains this text
      expect(screen.getByText(/account request submitted/i)).toBeInTheDocument();
    });
    // The form should be gone and replaced with the success panel
    expect(screen.queryByPlaceholderText('e1234567@u.nus.edu')).not.toBeInTheDocument();
  });

  it('shows client-side password mismatch error without calling register', async () => {
    mockRegister.mockClear();

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByPlaceholderText('e1234567@u.nus.edu'), 'x@u.nus.edu');
    await user.type(screen.getByPlaceholderText('At least 8 characters'), 'password123');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'different456');
    await user.click(screen.getByRole('button', { name: /request access/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    // register should NOT have been called (client validated before sending)
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('shows API error message when registration fails', async () => {
    const { ApiError } = await import('../api/client');
    mockRegister.mockRejectedValue(new ApiError(400, 'email domain is not allowed'));

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByPlaceholderText('e1234567@u.nus.edu'), 'user@gmail.com');
    await user.type(screen.getByPlaceholderText('At least 8 characters'), 'password123');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /request access/i }));

    await waitFor(() => {
      expect(screen.getByText('email domain is not allowed')).toBeInTheDocument();
    });
  });

  it('disables the button while submitting', async () => {
    let resolve: (v: { status: string; message: string }) => void = () => {};
    mockRegister.mockReturnValue(
      new Promise<{ status: string; message: string }>(r => { resolve = r; })
    );

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByPlaceholderText('e1234567@u.nus.edu'), 'x@u.nus.edu');
    await user.type(screen.getByPlaceholderText('At least 8 characters'), 'password123');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /request access/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });

    await act(async () => {
      resolve({ status: 'pending', message: 'ok' });
    });
  });
});
