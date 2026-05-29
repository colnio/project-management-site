import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { setIsAuthenticated, setProfileComplete } from './router';
import { router } from './router';
import { initTweaks } from './hooks/appearancePrefs';
import './styles/global.css';

// Apply persisted theme/density/accent before first render.
initTweaks();


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,        // treat data fresh for 5 min; mutations invalidate their keys
      refetchOnWindowFocus: false,  // stop the whole query set refiring on every tab/window focus
      retry: 1,
    },
  },
});

// Bridge component that wires auth state to the router guard
function AppBridge() {
  const { status, user } = useAuth();

  // Expose auth status and profile completion to route guards
  setIsAuthenticated(() => status === 'authenticated');
  setProfileComplete(() => !!user?.profile_completed);

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
