import '@testing-library/jest-dom';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { vi } from 'vitest';

// Mock pdfjs-dist globally so tests don't need DOMMatrix/canvas APIs
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(() =>
        Promise.resolve({
          getViewport: vi.fn(() => ({ width: 600, height: 800 })),
          render: vi.fn(() => ({ promise: Promise.resolve() })),
        })
      ),
    }),
  })),
}));

// Mock BlockNote — it uses browser-only APIs (ProseMirror, ResizeObserver, etc.)
// that are not available in jsdom. We mock the entire package.
vi.mock('@blocknote/core', () => ({
  BlockNoteSchema: {
    create: vi.fn(() => ({ blockSpecs: {} })),
  },
  defaultBlockSpecs: {},
  filterSuggestionItems: vi.fn((items: unknown[]) => items),
  insertOrUpdateBlockForSlashMenu: vi.fn(),
}));

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: vi.fn(() => ({
    document: [],
    replaceBlocks: vi.fn(),
  })),
  createReactBlockSpec: vi.fn(() => vi.fn(() => ({ config: {}, implementation: {} }))),
  SuggestionMenuController: () => null,
  getDefaultReactSlashMenuItems: vi.fn(() => []),
}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: vi.fn(() => null),
}));

// Set up MSW server for all tests
export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
