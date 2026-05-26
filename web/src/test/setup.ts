import '@testing-library/jest-dom';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';

// Set up MSW server for all tests
export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
