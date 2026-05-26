import { http, HttpResponse } from 'msw';

// Dev user stub used in tests
const devUser = {
  id: 'usr_dev',
  email: 'dev@halide-lab.org',
  display_name: 'Dev User',
  is_system_admin: false,
  created_at: '2025-01-01T00:00:00Z',
};

const devWorkspace = {
  id: 'ws_halide',
  name: 'Halide Lab',
  slug: 'halide-lab',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  created_by: 'usr_dev',
};

const devProject = {
  id: 'proj_nmc',
  name: 'NMC 4.30V Cycling',
  description: 'Investigating higher cutoff voltage effects on NMC cathodes.',
  visibility: 'workspace',
  workspace_id: 'ws_halide',
  created_by: 'usr_dev',
  created_at: '2025-02-01T00:00:00Z',
  updated_at: '2025-05-01T00:00:00Z',
};

export const handlers = [
  // Auth: login
  http.post('/v1/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    if (body.email === 'dev@halide-lab.org' && body.password === 'devpassword') {
      return HttpResponse.json({
        access_token: 'mock-access-token-abc123',
        user: devUser,
      });
    }
    return HttpResponse.json(
      { detail: 'Invalid credentials' },
      { status: 401 }
    );
  }),

  // Auth: refresh
  http.post('/v1/auth/refresh', () => {
    return HttpResponse.json({ access_token: 'mock-refreshed-token' });
  }),

  // Auth: logout
  http.post('/v1/auth/logout', () => {
    return HttpResponse.json({ ok: true });
  }),

  // Me
  http.get('/v1/me', () => {
    return HttpResponse.json(devUser);
  }),

  // Workspaces
  http.get('/v1/workspaces', () => {
    return HttpResponse.json([devWorkspace]);
  }),

  http.post('/v1/workspaces', async ({ request }) => {
    const body = await request.json() as { name: string };
    return HttpResponse.json({
      id: `ws_${Date.now()}`,
      name: body.name,
      slug: body.name.toLowerCase().replace(/\s+/g, '-'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'usr_dev',
    }, { status: 201 });
  }),

  // Projects
  http.get('/v1/workspaces/:id/projects', () => {
    return HttpResponse.json([devProject]);
  }),

  http.post('/v1/workspaces/:id/projects', async ({ request }) => {
    const body = await request.json() as { name: string; description?: string; visibility?: string };
    return HttpResponse.json({
      id: `proj_${Date.now()}`,
      name: body.name,
      description: body.description ?? '',
      visibility: body.visibility ?? 'workspace',
      workspace_id: 'ws_halide',
      created_by: 'usr_dev',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { status: 201 });
  }),

  http.get('/v1/projects/:id', ({ params }) => {
    if (params.id === 'proj_nmc') {
      return HttpResponse.json(devProject);
    }
    return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
  }),

  // Project sub-resources (all return empty lists in tests)
  http.get('/v1/projects/:id/samples', () => HttpResponse.json([])),
  http.get('/v1/projects/:id/experiments', () => HttpResponse.json([])),
  http.get('/v1/projects/:id/iterations', () => HttpResponse.json([])),
  http.get('/v1/projects/:id/artifacts', () => HttpResponse.json([])),
];
