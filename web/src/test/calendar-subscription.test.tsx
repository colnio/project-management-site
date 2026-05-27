/**
 * Tests for CalendarSubscriptionPanel (security remediation backfill).
 *
 * 1. Scope toggles send correct backend enum values ("all_visible_projects" / "per_project")
 * 2. The displayed ICS URL is built from window.location.origin + sub.ics_url (not hardcoded localhost)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './setup';
import { CalendarSubscriptionPanel } from '../components/CalendarSubscriptionPanel';

// The component uses clipboard API — mock it globally
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Helper to stub window.location.origin without replacing the entire window object
function stubOrigin(origin: string): () => void {
  const original = window.location.origin;
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, origin },
  });
  return () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, origin: original },
    });
  };
}

afterEach(() => {
  // Reset origin back to jsdom default between tests
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, origin: 'http://localhost:3000' },
  });
});

describe('CalendarSubscriptionPanel', () => {
  it('displays ICS URL built from window.location.origin, not hardcoded localhost', async () => {
    const restore = stubOrigin('https://graphene-lab.example.com');

    server.use(
      http.get('/v1/cal/me/subscription', () =>
        HttpResponse.json({
          token: 'cal_token_test',
          scope: 'all_visible_projects',
          project_ids: [],
          ics_url: '/v1/cal/me/calendar.ics?token=cal_token_test',
        })
      )
    );

    renderWithQuery(<CalendarSubscriptionPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'https://graphene-lab.example.com/v1/cal/me/calendar.ics?token=cal_token_test'
        )
      ).toBeInTheDocument();
    });

    restore();
  });

  it('sends "all_visible_projects" enum value in PATCH when "All visible projects" is clicked', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.get('/v1/cal/me/subscription', () =>
        HttpResponse.json({
          token: 'cal_token_abc',
          // Start as per_project so clicking "All visible projects" fires a mutation
          scope: 'per_project',
          project_ids: [],
          ics_url: '/v1/cal/me/calendar.ics?token=cal_token_abc',
        })
      ),
      http.patch('/v1/cal/me/subscription', async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          token: 'cal_token_abc',
          scope: capturedBody.scope as string,
          project_ids: [],
          ics_url: '/v1/cal/me/calendar.ics?token=cal_token_abc',
        });
      })
    );

    const user = userEvent.setup();
    renderWithQuery(<CalendarSubscriptionPanel />);

    await waitFor(() => {
      expect(screen.getByText('All visible projects')).toBeInTheDocument();
    });

    await user.click(screen.getByText('All visible projects'));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.scope).toBe('all_visible_projects');
    });
  });

  it('sends "per_project" enum value in PATCH when "Selected projects" is clicked', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.get('/v1/cal/me/subscription', () =>
        HttpResponse.json({
          token: 'cal_token_abc',
          // Start as all_visible_projects so clicking "Selected projects" fires a mutation
          scope: 'all_visible_projects',
          project_ids: [],
          ics_url: '/v1/cal/me/calendar.ics?token=cal_token_abc',
        })
      ),
      http.patch('/v1/cal/me/subscription', async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          token: 'cal_token_abc',
          scope: capturedBody.scope as string,
          project_ids: [],
          ics_url: '/v1/cal/me/calendar.ics?token=cal_token_abc',
        });
      })
    );

    const user = userEvent.setup();
    renderWithQuery(<CalendarSubscriptionPanel />);

    await waitFor(() => {
      expect(screen.getByText('Selected projects')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Selected projects'));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.scope).toBe('per_project');
    });
  });

  it('PATCH body uses exact backend enum values (not shorthand or display labels)', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.get('/v1/cal/me/subscription', () =>
        HttpResponse.json({
          token: 'cal_token_abc',
          scope: 'per_project',
          project_ids: [],
          ics_url: '/v1/cal/me/calendar.ics?token=cal_token_abc',
        })
      ),
      http.patch('/v1/cal/me/subscription', async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          token: 'cal_token_abc',
          scope: capturedBody.scope as string,
          project_ids: [],
          ics_url: '/v1/cal/me/calendar.ics?token=cal_token_abc',
        });
      })
    );

    const user = userEvent.setup();
    renderWithQuery(<CalendarSubscriptionPanel />);

    await waitFor(() => {
      expect(screen.getByText('All visible projects')).toBeInTheDocument();
    });

    await user.click(screen.getByText('All visible projects'));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    // Must NOT be a shorthand like "all" — must be the exact backend enum
    expect(capturedBody!.scope).not.toBe('all');
    expect(capturedBody!.scope).not.toBe('All visible projects');
    expect(capturedBody!.scope).toBe('all_visible_projects');
  });
});
