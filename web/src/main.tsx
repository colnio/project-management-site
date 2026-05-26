import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { setIsAuthenticated } from './router';
import { router } from './router';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// Bridge component that wires auth state to the router guard
function AppBridge() {
  const { status } = useAuth();

  // Expose auth status to route guards
  setIsAuthenticated(() => status === 'authenticated');

  // Don't render the router until we've resolved auth state
  if (status === 'loading') {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          height: '100vh',
          fontFamily: 'var(--mono)',
          fontSize: 13,
          color: 'var(--muted)',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: '2px solid var(--line)',
            borderTopColor: 'var(--ember)',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

const root = document.getElementById('root');
if (!root) throw new Error('No root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppBridge />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
