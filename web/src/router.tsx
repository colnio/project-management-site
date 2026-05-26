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
import { IterationDetailPage } from './pages/IterationDetailPage';
import { SampleDetailPage } from './pages/SampleDetailPage';
import { ExperimentDetailPage } from './pages/ExperimentDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { PageEditorPage } from './pages/PageEditorPage';

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

const iterationRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/iterations/$iterationId',
  component: IterationDetailPage,
});

const sampleRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/samples/$sampleId',
  component: SampleDetailPage,
});

const experimentRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/experiments/$experimentId',
  component: ExperimentDetailPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/settings',
  component: SettingsPage,
});

const pageEditorRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/pages/$pageId',
  component: PageEditorPage,
});

// ─── Router ──────────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  loginRoute,
  authGuardRoute.addChildren([
    homeRoute,
    workspacesRoute,
    projectRoute,
    iterationRoute,
    sampleRoute,
    experimentRoute,
    settingsRoute,
    pageEditorRoute,
  ]),
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
