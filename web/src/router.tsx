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
import { CalendarPage } from './pages/CalendarPage';
import { InboxPage } from './pages/InboxPage';
import { PeoplePage } from './pages/PeoplePage';
import { MeetingsPage } from './pages/MeetingsPage';
import { MeetingDetailPage } from './pages/MeetingDetailPage';
import { AdminPage } from './pages/AdminPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { TemplateDetailPage } from './pages/TemplateDetailPage';

// Token accessor injected at auth setup — used by guards
let isAuthenticated: () => boolean = () => false;
export function setIsAuthenticated(fn: () => boolean) {
  isAuthenticated = fn;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

function RootErrorComponent({ error }: { error: Error }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper, #faf9f6)',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          border: '1px solid var(--line, #e6e2d8)',
          borderRadius: 12,
          background: 'var(--surface, #fff)',
          padding: '28px 32px',
          fontFamily: 'var(--sans, system-ui)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--ink, #1a1a1a)' }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--muted, #7a7468)', lineHeight: 1.6, marginBottom: 18 }}>
          This view hit an unexpected error. You can reload it or head back home.
        </div>
        <pre
          style={{
            fontFamily: 'var(--mono, monospace)',
            fontSize: 11.5,
            color: 'var(--bad, #b94e3c)',
            background: 'var(--paper-2, #f3f1eb)',
            border: '1px solid var(--line, #e6e2d8)',
            borderRadius: 6,
            padding: '8px 10px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            marginBottom: 18,
            maxHeight: 140,
            overflow: 'auto',
          }}
        >
          {error?.message ?? String(error)}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="top-btn primary"
            style={{ fontSize: 13, padding: '7px 14px' }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <button
            className="top-btn"
            style={{ fontSize: 13, padding: '7px 14px' }}
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: RootErrorComponent,
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

const calendarRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/calendar',
  component: CalendarPage,
});

const inboxRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/inbox',
  component: InboxPage,
});

const peopleRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/people',
  component: PeoplePage,
});

const meetingsRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/meetings',
  component: MeetingsPage,
});

const meetingDetailRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/meetings/$meetingId',
  component: MeetingDetailPage,
});

const adminRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/admin',
  component: AdminPage,
});

const templatesRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/templates',
  component: TemplatesPage,
});

const templateDetailRoute = createRoute({
  getParentRoute: () => authGuardRoute,
  path: '/templates/$workflowKey',
  component: TemplateDetailPage,
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
    calendarRoute,
    inboxRoute,
    peopleRoute,
    meetingsRoute,
    meetingDetailRoute,
    adminRoute,
    templatesRoute,
    templateDetailRoute,
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
