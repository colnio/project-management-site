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

  // ── Page endpoints ────────────────────────────────────────────────────────

  // Create page
  http.post('/v1/projects/:id/pages', async ({ request, params }) => {
    const body = await request.json() as { parent_type: string; parent_id: string; blocks: unknown };
    const page = {
      id: `page_${Date.now()}`,
      project_id: params.id as string,
      parent_type: body.parent_type,
      parent_id: body.parent_id,
      current_revision_id: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return new HttpResponse(
      JSON.stringify({ page, blocks: body.blocks }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'ETag': `"etag-${page.id}"`,
        },
      }
    );
  }),

  // Get page
  http.get('/v1/pages/:id', ({ params }) => {
    const pageId = params.id as string;
    return new HttpResponse(
      JSON.stringify({
        id: pageId,
        project_id: 'proj_nmc',
        parent_type: 'project',
        parent_id: 'proj_nmc',
        blocks: [],
        markdown_export: '',
        current_revision_id: `rev_initial`,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'ETag': `"etag-${pageId}-1"`,
        },
      }
    );
  }),

  // Update page (PUT)
  http.put('/v1/pages/:id', async ({ request, params }) => {
    const pageId = params.id as string;
    const ifMatch = request.headers.get('If-Match');
    const body = await request.json() as { blocks: unknown; source: string };

    // Simulate 412 if If-Match is "stale-etag"
    if (ifMatch === '"stale-etag"') {
      return HttpResponse.json(
        {
          code: 'precondition_failed',
          message: 'ETag mismatch',
          details: {
            current: {
              id: pageId,
              project_id: 'proj_nmc',
              parent_type: 'project',
              parent_id: 'proj_nmc',
              blocks: [],
              markdown_export: '',
              current_revision_id: 'rev_server',
              _etag: `"etag-${pageId}-server"`,
            },
          },
        },
        { status: 412 }
      );
    }

    const rev = {
      id: `rev_${Date.now()}`,
      page_id: pageId,
      source: body.source,
      status: 'current',
      author: 'dev@halide-lab.org',
      label: undefined,
      blob_hash: 'abc123',
      markdown_export: '',
      retention_class: 'standard',
      parent_revision_id: undefined,
      created_at: new Date().toISOString(),
    };
    const page = {
      id: pageId,
      project_id: 'proj_nmc',
      parent_type: 'project',
      parent_id: 'proj_nmc',
      current_revision_id: rev.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return new HttpResponse(
      JSON.stringify({ page, revision: rev, blocks: body.blocks }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'ETag': `"etag-${pageId}-${rev.id}"`,
        },
      }
    );
  }),

  // List revisions
  http.get('/v1/pages/:id/revisions', ({ params }) => {
    return HttpResponse.json({
      revisions: [
        {
          id: 'rev_initial',
          page_id: params.id,
          source: 'human',
          status: 'current',
          author: 'dev@halide-lab.org',
          label: 'Initial',
          blob_hash: 'abc123',
          markdown_export: '',
          retention_class: 'standard',
          parent_revision_id: undefined,
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
    });
  }),

  // Get revision
  http.get('/v1/revisions/:id', ({ params }) => {
    return HttpResponse.json({
      revision: {
        id: params.id,
        page_id: 'page_1',
        source: 'human',
        status: 'current',
        author: 'dev@halide-lab.org',
        label: 'Test revision',
        blob_hash: 'abc123',
        markdown_export: '# Test\n\nContent here.',
        retention_class: 'standard',
        parent_revision_id: undefined,
        created_at: '2025-01-01T00:00:00Z',
      },
      blocks: [],
    });
  }),

  // Diff revisions
  http.get('/v1/revisions/:id/diff', () => {
    return HttpResponse.json({
      lines: [
        { op: ' ', text: '# Notes' },
        { op: '-', text: 'Old content' },
        { op: '+', text: 'New content' },
      ],
    });
  }),

  // Presence
  http.get('/v1/pages/:id/presence', () => {
    return HttpResponse.json({ present: [] });
  }),

  http.post('/v1/pages/:id/presence/heartbeat', () => {
    return HttpResponse.json({ ok: true });
  }),

  // Restore
  http.post('/v1/pages/:id/restore', async ({ request, params }) => {
    const body = await request.json() as { revision_id: string };
    return HttpResponse.json({
      page: {
        id: params.id,
        project_id: 'proj_nmc',
        parent_type: 'project',
        parent_id: 'proj_nmc',
        current_revision_id: body.revision_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      revision: {
        id: body.revision_id,
        page_id: params.id,
        source: 'human',
        status: 'current',
        author: 'dev@halide-lab.org',
        blob_hash: 'abc123',
        markdown_export: '',
        retention_class: 'standard',
        created_at: new Date().toISOString(),
      },
    });
  }),

  // ── Samples/Experiments (needed by ref blocks) ────────────────────────────

  http.get('/v1/samples/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      identifier: `${params.id as string}`,
      name: 'Test Sample',
      description: '',
      kind: 'cell',
      status: 'active',
      project_id: 'proj_nmc',
      properties: {},
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      created_by: 'usr_dev',
      description_page_id: undefined,
    });
  }),

  http.get('/v1/experiments/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      method: 'cycling',
      status: 'in_progress',
      project_id: 'proj_nmc',
      result_summary: '',
      parameters: {},
      notes_page_id: undefined,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      created_by: 'usr_dev',
    });
  }),

  // ─────────────────────────────────────────────────────────────────────────

  // ── Events endpoints ──────────────────────────────────────────────────────

  // List events for a project (supports ?from=&to=)
  http.get('/v1/projects/:id/events', () => {
    return HttpResponse.json([
      {
        id: 'evt_1',
        project_id: 'proj_nmc',
        iteration_id: undefined,
        kind: 'deadline',
        title: 'DOE-BES Report',
        description: 'Submit quarterly report to DOE-BES.',
        start_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        end_at: undefined,
        all_day: true,
        recurrence_rule: undefined,
        created_at: '2025-02-01T00:00:00Z',
        updated_at: '2025-02-01T00:00:00Z',
        created_by: 'usr_dev',
      },
      {
        id: 'evt_2',
        project_id: 'proj_nmc',
        iteration_id: undefined,
        kind: 'meeting',
        title: 'Team sync',
        description: 'Weekly lab meeting.',
        start_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        end_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
        all_day: false,
        recurrence_rule: 'FREQ=WEEKLY',
        created_at: '2025-02-01T00:00:00Z',
        updated_at: '2025-02-01T00:00:00Z',
        created_by: 'usr_dev',
      },
    ]);
  }),

  // Create event
  http.post('/v1/projects/:id/events', async ({ request, params }) => {
    const body = await request.json() as {
      kind: string;
      title: string;
      description?: string;
      start_at: string;
      end_at?: string;
      all_day?: boolean;
      recurrence_rule?: string;
    };
    return HttpResponse.json({
      id: `evt_${Date.now()}`,
      project_id: params.id as string,
      iteration_id: undefined,
      kind: body.kind,
      title: body.title,
      description: body.description,
      start_at: body.start_at,
      end_at: body.end_at,
      all_day: body.all_day ?? false,
      recurrence_rule: body.recurrence_rule,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'usr_dev',
    }, { status: 201 });
  }),

  // Get single event
  http.get('/v1/events/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id as string,
      project_id: 'proj_nmc',
      iteration_id: undefined,
      kind: 'custom',
      title: 'Test Event',
      description: '',
      start_at: new Date().toISOString(),
      end_at: undefined,
      all_day: false,
      recurrence_rule: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'usr_dev',
    });
  }),

  // Update event
  http.patch('/v1/events/:id', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: params.id as string,
      project_id: 'proj_nmc',
      iteration_id: undefined,
      kind: body.kind ?? 'custom',
      title: body.title ?? 'Updated Event',
      description: body.description ?? '',
      start_at: body.start_at ?? new Date().toISOString(),
      end_at: body.end_at ?? undefined,
      all_day: body.all_day ?? false,
      recurrence_rule: body.recurrence_rule ?? undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'usr_dev',
    });
  }),

  // Delete event
  http.delete('/v1/events/:id', () => new HttpResponse(null, { status: 204 })),

  // ── Iteration endpoints (detail) ──────────────────────────────────────────

  http.get('/v1/iterations/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      project_id: 'proj_nmc',
      title: 'Test Iteration',
      description: '',
      status: 'active',
      position: 1,
      start_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      end_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      created_by: 'usr_dev',
    });
  }),

  // ── Sample/experiment/iteration links ─────────────────────────────────────

  http.get('/v1/iterations/:id/samples', () => HttpResponse.json([])),
  http.post('/v1/iterations/:id/samples', async ({ request }) => {
    const body = await request.json() as { sample_id: string; role?: string };
    return HttpResponse.json({ ok: true, sample_id: body.sample_id });
  }),
  http.delete('/v1/iterations/:id/samples/:sampleId', () => HttpResponse.json({ ok: true })),

  http.get('/v1/samples/:id/lineage', () => HttpResponse.json({ nodes: [], edges: [] })),
  http.post('/v1/samples/:id/relations', () => HttpResponse.json({ ok: true })),

  http.get('/v1/experiments/:id/samples', () => HttpResponse.json([])),
  http.post('/v1/experiments/:id/samples', () => HttpResponse.json({ ok: true })),
  http.delete('/v1/experiments/:id/samples/:sampleId', () => HttpResponse.json({ ok: true })),

  // ── AI: Conversations ─────────────────────────────────────────────────────

  http.get('/v1/projects/:id/ai/conversations', () =>
    HttpResponse.json([
      {
        id: 'conv_1',
        project_id: 'proj_nmc',
        started_by: 'usr_dev',
        title: 'General',
        created_at: '2025-05-01T09:00:00Z',
      },
    ])
  ),

  http.post('/v1/projects/:id/ai/conversations', async ({ request }) => {
    const body = await request.json() as { title: string };
    return HttpResponse.json({
      id: `conv_${Date.now()}`,
      project_id: 'proj_nmc',
      started_by: 'usr_dev',
      title: body.title,
      created_at: new Date().toISOString(),
    }, { status: 201 });
  }),

  http.get('/v1/ai/conversations/:id', ({ params }) => {
    if (params.id === 'conv_1') {
      return HttpResponse.json([
        {
          role: 'assistant',
          content: 'Hello! I can help you analyze this project. What would you like to know?',
          seq: 0,
          created_at: '2025-05-01T09:01:00Z',
        },
      ]);
    }
    return HttpResponse.json([]);
  }),

  // SSE streaming endpoint — returns a simple stubbed SSE response
  http.post('/v1/ai/conversations/:id/messages', async ({ request }) => {
    const body = await request.json() as { content: string };
    const content = body.content ?? '';
    const sseBody =
      `event: token\ndata: {"delta":"I received: "}\n\n` +
      `event: token\ndata: {"delta":"${content.slice(0, 40).replace(/"/g, '\\"')}"}\n\n` +
      `event: done\ndata: {"conversation_id":"${(request as Request & { params?: Record<string,string> }).url}"}\n\n`;
    return new HttpResponse(sseBody, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  }),

  // Tool-call approval/rejection
  http.post('/v1/ai/conversations/:id/tool-calls/:tcid/approve', () =>
    HttpResponse.json({ ok: true })
  ),
  http.post('/v1/ai/conversations/:id/tool-calls/:tcid/reject', () =>
    HttpResponse.json({ ok: true })
  ),

  // ── AI: Autonomy ──────────────────────────────────────────────────────────

  http.get('/v1/workspaces/:id/autonomy', () =>
    HttpResponse.json({
      scope: 'workspace',
      scope_id: 'ws_halide',
      mode: 'suggest_writes',
      allowed_tools: ['draft_page', 'create_reminder'],
    })
  ),

  http.patch('/v1/workspaces/:id/autonomy', async ({ request }) => {
    const body = await request.json() as { mode: string; allowed_tools: string[] };
    return HttpResponse.json({
      scope: 'workspace',
      scope_id: 'ws_halide',
      mode: body.mode,
      allowed_tools: body.allowed_tools,
    });
  }),

  http.get('/v1/projects/:id/autonomy', () =>
    HttpResponse.json({
      scope: 'project',
      scope_id: 'proj_nmc',
      mode: 'suggest_writes',
      allowed_tools: ['draft_page'],
    })
  ),

  http.patch('/v1/projects/:id/autonomy', async ({ request }) => {
    const body = await request.json() as { mode: string; allowed_tools: string[] };
    return HttpResponse.json({
      scope: 'project',
      scope_id: 'proj_nmc',
      mode: body.mode,
      allowed_tools: body.allowed_tools,
    });
  }),

  // ── AI: Workflows ─────────────────────────────────────────────────────────

  http.get('/v1/ai/workflows', () =>
    HttpResponse.json([
      {
        key: 'battery_safety_risk_v1',
        title: 'Battery Safety Risk Assessment',
        description: 'Analyzes project data for safety risks and generates a structured risk register.',
        scope: 'project',
      },
      {
        key: 'iteration_summary_v1',
        title: 'Iteration Summary',
        description: 'Summarizes findings and progress for the current iteration.',
        scope: 'project',
      },
    ])
  ),

  http.post('/v1/ai/workflows/:key/run', async ({ params }) => {
    return HttpResponse.json({
      id: `run_${Date.now()}`,
      workflow_key: params.key as string,
      status: 'completed',
      output: {
        overall_rating: 'medium',
        category_ratings: {
          'Thermal': 'low',
          'Mechanical': 'medium',
          'Chemical': 'high',
        },
        mitigations: [
          'Implement thermal runaway detection on all cycling cells.',
          'Review electrolyte formulation to reduce reactivity.',
          'Maintain strict formation protocol for new batches.',
        ],
        flagged_for_PI_review: false,
        summary: 'Risk profile is medium. One chemical risk category is high and warrants attention before the next iteration.',
      },
      result_page_id: undefined,
      step_results: {},
    });
  }),

  http.get('/v1/ai/runs/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id as string,
      workflow_key: 'battery_safety_risk_v1',
      status: 'completed',
      output: {
        overall_rating: 'medium',
        summary: 'Risk profile is medium.',
        mitigations: ['Implement thermal runaway detection.'],
        flagged_for_PI_review: false,
      },
      result_page_id: undefined,
      step_results: {},
    });
  }),

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
