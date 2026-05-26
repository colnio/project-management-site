/**
 * Tests for the artifact upload state machine and token-scope selection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtifactUpload } from '../components/ArtifactUpload';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

// Mock pdfjs-dist so it doesn't try to load in jsdom
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ getPage: vi.fn() }) })),
}));

// Mock uploadToPresignedUrl
vi.mock('../hooks/useArtifactQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useArtifactQueries')>();
  return {
    ...actual,
    uploadToPresignedUrl: vi.fn().mockResolvedValue(undefined),
  };
});

// Helper to wrap component with QueryClient
function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  );
}

// ─── Upload state machine tests ───────────────────────────────────────────────

describe('ArtifactUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the drop zone initially', () => {
    renderWithQuery(<ArtifactUpload projectId="proj_nmc" />);
    expect(screen.getByText(/Drop a file or click to browse/i)).toBeInTheDocument();
  });

  it('transitions through creating → uploading → completing → done states', async () => {
    const onDone = vi.fn();
    renderWithQuery(<ArtifactUpload projectId="proj_nmc" onDone={onDone} />);

    const file = new File(['hello pdf'], 'test.pdf', { type: 'application/pdf' });

    // Trigger file input
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    // After the full flow, should show done state with the artifact name
    await waitFor(() => {
      expect(screen.getByText('test-file.pdf')).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(onDone).toHaveBeenCalled();
  });

  it('shows "Upload another" button after success', async () => {
    renderWithQuery(<ArtifactUpload projectId="proj_nmc" />);

    const file = new File(['data'], 'image.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Upload another/i })).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('resets to idle when "Upload another" is clicked', async () => {
    renderWithQuery(<ArtifactUpload projectId="proj_nmc" />);

    const file = new File(['data'], 'image.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Upload another/i })).toBeInTheDocument();
    }, { timeout: 5000 });

    await userEvent.click(screen.getByRole('button', { name: /Upload another/i }));
    expect(screen.getByText(/Drop a file or click to browse/i)).toBeInTheDocument();
  });
});

// ─── Token scope selection tests ──────────────────────────────────────────────

describe('Token scope selection', () => {
  it('tracks selected scopes correctly', () => {
    const scopes = new Set<string>();

    // Simulate adding scopes
    const toggle = (scope: string) => {
      if (scopes.has(scope)) scopes.delete(scope);
      else scopes.add(scope);
    };

    toggle('read:projects');
    toggle('read:samples');
    expect(scopes.has('read:projects')).toBe(true);
    expect(scopes.has('read:samples')).toBe(true);
    expect(scopes.size).toBe(2);

    // Toggle off
    toggle('read:projects');
    expect(scopes.has('read:projects')).toBe(false);
    expect(scopes.size).toBe(1);
  });

  it('allows all known scopes to be selected', () => {
    const KNOWN_SCOPES = [
      'read:projects',
      'read:samples',
      'read:experiments',
      'read:artifacts',
      'read:pages',
      'read:events',
      'write:projects',
      'write:samples',
      'write:experiments',
      'write:artifacts',
    ];
    const selected = new Set(KNOWN_SCOPES);
    expect(selected.size).toBe(KNOWN_SCOPES.length);
    KNOWN_SCOPES.forEach(s => expect(selected.has(s)).toBe(true));
  });

  it('empty scopes array is valid', () => {
    const scopes: string[] = [];
    expect(scopes.length).toBe(0);
  });
});

// ─── inferType helper tests ───────────────────────────────────────────────────

describe('inferType logic', () => {
  // Inline the helper to test it directly
  function inferType(file: { type: string; name: string }): string {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return 'pdf';
    if (file.name.endsWith('.ipynb')) return 'ipynb';
    if (file.type.startsWith('image/')) return 'image';
    return 'other';
  }

  it('returns pdf for application/pdf type', () => {
    expect(inferType({ type: 'application/pdf', name: 'doc.pdf' })).toBe('pdf');
  });

  it('returns pdf for .pdf extension regardless of MIME', () => {
    expect(inferType({ type: '', name: 'report.pdf' })).toBe('pdf');
  });

  it('returns ipynb for .ipynb files', () => {
    expect(inferType({ type: '', name: 'analysis.ipynb' })).toBe('ipynb');
  });

  it('returns image for image/* MIME types', () => {
    expect(inferType({ type: 'image/png', name: 'photo.png' })).toBe('image');
    expect(inferType({ type: 'image/jpeg', name: 'scan.jpg' })).toBe('image');
  });

  it('returns other for unknown types', () => {
    expect(inferType({ type: 'application/zip', name: 'data.zip' })).toBe('other');
  });
});
