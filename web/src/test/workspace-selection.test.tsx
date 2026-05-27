/**
 * Tests for workspace selection correctness (security remediation backfill).
 *
 * Asserts that WorkspaceAutonomyWrapper (SettingsPage) and WorkspaceInfoSection
 * (AdminPage) use the SELECTED workspace (from useCurrentWorkspace) rather than
 * always falling back to workspaces[0].
 *
 * Strategy: mock useCurrentWorkspace to return a workspaceId that is NOT the first
 * workspace in the list, then assert the correct workspace data is shown / queried.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './setup';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, params: _params, ...rest }: { children: React.ReactNode; to: string; params?: Record<string, string>; [k: string]: unknown }) =>
    <a href={to} {...rest}>{children}</a>,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr_dev', email: 'dev@graphene-lab.org', display_name: 'Dev User', is_system_admin: false },
    logout: vi.fn(),
    login: vi.fn(),
    status: 'authenticated',
  }),
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

// Two workspaces: the SELECTED one is ws_second (index 1), NOT ws_first (index 0)
const WS_FIRST = {
  id: 'ws_first',
  name: 'First Workspace',
  slug: 'first-workspace',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  created_by: 'usr_dev',
};
const WS_SECOND = {
  id: 'ws_second',
  name: 'Second Workspace',
  slug: 'second-workspace',
  created_at: '2025-02-01T00:00:00Z',
  updated_at: '2025-02-01T00:00:00Z',
  created_by: 'usr_dev',
};

// Mock useCurrentWorkspace to return ws_second as the selected workspace
vi.mock('../hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useQueries')>();
  return {
    ...actual,
    useCurrentWorkspace: () => ({
      workspaceId: 'ws_second',          // selected = NOT workspaces[0]
      workspaces: [WS_FIRST, WS_SECOND], // ws_first is index 0
      setWorkspaceId: vi.fn(),
    }),
    useWorkspaces: () => ({
      data: [WS_FIRST, WS_SECOND],
    }),
    useWorkspaceMembers: (id: string) => ({
      data: id === 'ws_second'
        ? [{ id: 'mem_1', workspace_id: 'ws_second', user_id: 'usr_dev', role: 'admin', email: 'dev@graphene-lab.org', display_name: 'Dev User', user_created_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z' }]
        : [],
      isLoading: false,
      isError: false,
    }),
  };
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ─── WorkspaceInfoSection (AdminPage) ─────────────────────────────────────────

describe('AdminPage — WorkspaceInfoSection uses selected workspace, not workspaces[0]', () => {
  beforeEach(() => {
    // Provide autonomy, usage, members, workflows, audit endpoints for ws_second
    server.use(
      http.get('/v1/workspaces/:id/autonomy', ({ params }) => {
        return HttpResponse.json({
          scope: 'workspace',
          scope_id: params.id as string,
          mode: 'suggest_writes',
          allowed_tools: ['draft_page'],
        });
      }),
      http.get('/v1/workspaces/:id/ai/usage', ({ params }) => {
        return HttpResponse.json({
          workspace_id: params.id as string,
          spent_today: 0.001,
          spent_month: 0.012,
          monthly_cap: 10.0,
          pct: 0.0012,
          model: 'deepseek/deepseek-v4-flash:free',
        });
      }),
      http.get('/v1/workspaces/:id/members', ({ params }) => {
        if (params.id === 'ws_second') {
          return HttpResponse.json([
            {
              id: 'mem_1',
              workspace_id: 'ws_second',
              user_id: 'usr_dev',
              role: 'admin',
              email: 'dev@graphene-lab.org',
              display_name: 'Dev User',
              user_created_at: '2025-01-01T00:00:00Z',
              created_at: '2025-01-01T00:00:00Z',
            },
          ]);
        }
        return HttpResponse.json([]);
      }),
      http.get('/v1/workspaces', () =>
        HttpResponse.json([WS_FIRST, WS_SECOND])
      ),
      http.get('/v1/audit', () => HttpResponse.json([])),
      http.get('/v1/admin/audit', () => HttpResponse.json([])),
      http.get('/v1/workspaces/:id/audit', () => HttpResponse.json([]))
    );
  });

  it('renders the SELECTED workspace name (ws_second), not workspaces[0] (ws_first)', async () => {
    const { AdminPage } = await import('../pages/AdminPage');
    renderWithQuery(<AdminPage />);

    await waitFor(() => {
      // "Second Workspace" is the selected one — it must be shown
      expect(screen.getByText('Second Workspace')).toBeInTheDocument();
    });

    // "First Workspace" must NOT be shown (it's index 0 but not selected)
    expect(screen.queryByText('First Workspace')).not.toBeInTheDocument();
  });

  it('renders the SELECTED workspace slug (second-workspace)', async () => {
    const { AdminPage } = await import('../pages/AdminPage');
    renderWithQuery(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('second-workspace')).toBeInTheDocument();
    });

    expect(screen.queryByText('first-workspace')).not.toBeInTheDocument();
  });
});

// ─── WorkspaceAutonomyWrapper (SettingsPage) ──────────────────────────────────

describe('SettingsPage — WorkspaceAutonomyWrapper uses selected workspace', () => {
  beforeEach(() => {
    server.use(
      http.get('/v1/workspaces/:id/autonomy', ({ params }) => {
        // Return a distinguishable mode per workspace so we can tell which was fetched
        const mode = params.id === 'ws_second' ? 'suggest_writes' : 'read_only';
        return HttpResponse.json({
          scope: 'workspace',
          scope_id: params.id as string,
          mode,
          allowed_tools: [],
        });
      }),
      http.get('/v1/workspaces', () =>
        HttpResponse.json([WS_FIRST, WS_SECOND])
      ),
      http.get('/v1/tokens', () => HttpResponse.json([])),
      http.get('/v1/cal/me/subscription', () =>
        HttpResponse.json({
          token: 'cal_tok',
          scope: 'all_visible_projects',
          project_ids: [],
          ics_url: '/v1/cal/me/calendar.ics?token=cal_tok',
        })
      )
    );
  });

  it('queries autonomy for the SELECTED workspace (ws_second), not workspaces[0]', async () => {
    const queriedIds: string[] = [];
    server.use(
      http.get('/v1/workspaces/:id/autonomy', ({ params }) => {
        queriedIds.push(params.id as string);
        return HttpResponse.json({
          scope: 'workspace',
          scope_id: params.id as string,
          mode: 'suggest_writes',
          allowed_tools: ['draft_page'],
        });
      })
    );

    const { SettingsPage } = await import('../pages/SettingsPage');
    renderWithQuery(<SettingsPage />);

    // Wait until the autonomy section has loaded
    await waitFor(
      () => {
        expect(queriedIds.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    // The SELECTED workspace id must have been queried
    expect(queriedIds).toContain('ws_second');
    // The first workspace must NOT have been queried via this hook
    expect(queriedIds).not.toContain('ws_first');
  });
});
