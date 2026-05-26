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

  // Artifact endpoints
  http.post('/v1/projects/:id/artifacts', async ({ request }) => {
    const body = await request.json() as { filename: string; content_type: string; size_bytes: number; type?: string };
    const artifact = {
      id: `art_${Date.now()}`,
      project_id: 'proj_nmc',
      filename: body.filename,
      content_type: body.content_type,
      size_bytes: body.size_bytes,
      type: body.type ?? 'other',
      storage_key: `uploads/${body.filename}`,
      original_url: '',
      rendered_url: '',
      thumbnail_url: '',
      processing_status: 'pending',
      uploaded_at: new Date().toISOString(),
      uploaded_by: 'usr_dev',
      metadata: null,
    };
    return HttpResponse.json({
      artifact,
      upload_url: 'http://localhost:9000/mock-presigned-url',
      method: 'PUT',
      headers: { 'Content-Type': body.content_type },
    });
  }),

  http.post('/v1/artifacts/:id/complete', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      project_id: 'proj_nmc',
      filename: 'test-file.pdf',
      content_type: 'application/pdf',
      size_bytes: 1024,
      type: 'pdf',
      storage_key: 'uploads/test-file.pdf',
      original_url: 'http://localhost:9000/test-file.pdf',
      rendered_url: '',
      thumbnail_url: '',
      processing_status: 'done',
      uploaded_at: new Date().toISOString(),
      uploaded_by: 'usr_dev',
      metadata: null,
    });
  }),

  http.delete('/v1/artifacts/:id', () => new HttpResponse(null, { status: 204 })),

  http.get('/v1/samples/:id/artifacts', () => HttpResponse.json([])),
  http.post('/v1/samples/:id/artifacts', async ({ request }) => {
    const body = await request.json() as { artifact_id: string; role?: string };
    return HttpResponse.json({
      id: `sa_${Date.now()}`,
      sample_id: 'samp_1',
      artifact_id: body.artifact_id,
      role: body.role,
      attached_by: 'usr_dev',
      created_at: new Date().toISOString(),
    });
  }),

  http.get('/v1/experiments/:id/artifacts', () => HttpResponse.json([])),
  http.post('/v1/experiments/:id/artifacts', async ({ request }) => {
    const body = await request.json() as { artifact_id: string; role?: string };
    return HttpResponse.json({
      id: `ea_${Date.now()}`,
      experiment_id: 'exp_1',
      artifact_id: body.artifact_id,
      role: body.role,
      attached_by: 'usr_dev',
      created_at: new Date().toISOString(),
    });
  }),

  http.get('/v1/artifacts/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      project_id: 'proj_nmc',
      filename: 'test.pdf',
      content_type: 'application/pdf',
      size_bytes: 2048,
      type: 'pdf',
      storage_key: 'test.pdf',
      original_url: '',
      rendered_url: '',
      thumbnail_url: '',
      processing_status: 'done',
      uploaded_at: new Date().toISOString(),
      uploaded_by: 'usr_dev',
      metadata: null,
    });
  }),

  // PAT endpoints
  http.get('/v1/tokens', () => HttpResponse.json([])),
  http.post('/v1/tokens', async ({ request }) => {
    const body = await request.json() as { name: string; scopes: string[]; expires_at?: string };
    return HttpResponse.json({
      id: `tok_${Date.now()}`,
      name: body.name,
      scopes: body.scopes,
      token: 'hlp_mock_secret_token_xyz',
      expires_at: body.expires_at,
    });
  }),
  http.delete('/v1/tokens/:id', () => HttpResponse.json({ ok: true })),

  // Calendar subscription
  http.get('/v1/cal/me/subscription', () => HttpResponse.json({
    token: 'cal_token_abc',
    scope: 'all',
    project_ids: [],
    ics_url: '/v1/cal/me/calendar.ics?token=cal_token_abc',
  })),
  http.post('/v1/cal/me/subscription/rotate', () => HttpResponse.json({
    token: 'cal_token_rotated',
    scope: 'all',
    project_ids: [],
    ics_url: '/v1/cal/me/calendar.ics?token=cal_token_rotated',
  })),
  http.patch('/v1/cal/me/subscription', async ({ request }) => {
    const body = await request.json() as { scope?: string; project_ids?: string[] };
    return HttpResponse.json({
      token: 'cal_token_abc',
      scope: body.scope ?? 'all',
      project_ids: body.project_ids ?? [],
      ics_url: '/v1/cal/me/calendar.ics?token=cal_token_abc',
    });
  }),
];
