/**
 * Tests for MeetingsPage — meeting-kind options (security remediation backfill).
 *
 * Asserts:
 * 1. The meeting-kind <select> options are exactly the backend-valid set
 *    (sync, review, planning, retro, kickoff)
 * 2. 'retrospective' is NOT offered — it was the bug; the valid backend value is 'retro'
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './setup';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

// Mock TanStack Router — MeetingsPage and Link use it
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params: _params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    [k: string]: unknown;
  }) => <a href={to} {...rest}>{children}</a>,
}));

// Mock useAuth (AppShell reads user)
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr_dev', email: 'dev@graphene-lab.org', display_name: 'Dev', is_system_admin: false },
    logout: vi.fn(),
    login: vi.fn(),
    status: 'authenticated',
  }),
}));

// Mock useCurrentWorkspace — stable, deterministic workspace
vi.mock('../hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useQueries')>();
  return {
    ...actual,
    useCurrentWorkspace: () => ({
      workspaceId: 'ws_graphene',
      workspaces: [
        {
          id: 'ws_graphene',
          name: 'Graphene Lab',
          slug: 'graphene-lab',
          created_at: '',
          updated_at: '',
          created_by: 'usr_dev',
        },
      ],
      setWorkspaceId: vi.fn(),
    }),
  };
});

// Mock AppShell to avoid its heavy sidebar/router rendering.
// We must render topBarActions so the "+ New meeting" button is accessible in tests.
vi.mock('../components/AppShell', () => ({
  AppShell: ({
    children,
    topBarActions,
  }: {
    children: React.ReactNode;
    topBarActions?: React.ReactNode;
    topBarCrumbs?: unknown;
  }) => (
    <div data-testid="app-shell">
      {topBarActions && <div data-testid="top-bar-actions">{topBarActions}</div>}
      {children}
    </div>
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MeetingsPage — meeting-kind options', () => {
  it('the New Meeting modal kind select has exactly the valid backend values', async () => {
    server.use(
      http.get('/v1/workspaces/:id/meetings', () => HttpResponse.json([]))
    );

    const { MeetingsPage } = await import('../pages/MeetingsPage');
    renderWithQuery(<MeetingsPage />);

    // Click "+ New meeting" to open the modal
    const user = userEvent.setup();
    const newMeetingBtn = await screen.findByRole('button', { name: /new meeting/i });
    await user.click(newMeetingBtn);

    // The Kind select is now rendered
    const kindSelect = await screen.findByRole('combobox');
    const optionValues = Array.from(kindSelect.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value
    );

    // --- Positive assertions: all expected values are present ---
    expect(optionValues).toContain('sync');
    expect(optionValues).toContain('review');
    expect(optionValues).toContain('planning');
    expect(optionValues).toContain('retro');
    expect(optionValues).toContain('kickoff');

    // --- Regression: 'retrospective' must NOT appear (was the bug) ---
    expect(optionValues).not.toContain('retrospective');

    // --- Exact set: no undocumented extras ---
    expect(optionValues).toHaveLength(5);
  });

  it('does not offer "retrospective" as a meeting kind option', async () => {
    server.use(
      http.get('/v1/workspaces/:id/meetings', () => HttpResponse.json([]))
    );

    const { MeetingsPage } = await import('../pages/MeetingsPage');
    renderWithQuery(<MeetingsPage />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /new meeting/i }));

    const kindSelect = await screen.findByRole('combobox');
    const optionValues = Array.from(kindSelect.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value
    );

    // The fix: backend rejects 'retrospective'; only 'retro' is valid
    expect(optionValues).not.toContain('retrospective');
    expect(optionValues).toContain('retro');
  });

  it('defaults the kind select to "sync"', async () => {
    server.use(
      http.get('/v1/workspaces/:id/meetings', () => HttpResponse.json([]))
    );

    const { MeetingsPage } = await import('../pages/MeetingsPage');
    renderWithQuery(<MeetingsPage />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /new meeting/i }));

    const kindSelect = (await screen.findByRole('combobox')) as HTMLSelectElement;
    expect(kindSelect.value).toBe('sync');
  });
});
