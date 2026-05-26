import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';

// Token accessor injected at auth setup — used by guards
let isAuthenticated: () => boolean = () => false;
export function setIsAuthenticated(fn: () => boolean) {
  isAuthenticated = fn;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// Guard for all authenticated routes
const authGuardRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => <Outlet />,
});

const homeRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/',
  component: HomePage,
});

const workspacesRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/workspaces',
  component: WorkspacesPage,
});

const projectRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/projects/$projectId',
  component: ProjectDetailPage,
});

// ─── Router ──────────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  loginRoute,
  authGuardRoute.addChildren([homeRoute, workspacesRoute, projectRoute]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
