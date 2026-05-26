# Development Guide — Lab Project Management Platform

This is the developer-facing guide for building the platform **locally**, before any AWS exists.
It is the working companion to the production spec in [`techSpec.md`](./techSpec.md) and the UI
prototype in [`design/`](./design/). The architecture, entities, and v1 scope are defined there;
this document covers **how to run and build the system on your own machine** and the order in
which to build it.

> **Why local-first?** The spec targets AWS (EC2, OpenRouter, S3, SES, Microsoft Entra). None of
> that is needed to develop the application. Every cloud dependency has a local stand-in that
> speaks the same protocol, so application code is written once and only *configuration* changes
> when we deploy. The mapping is in [§2](#2-prod--local-service-mapping).

---

## 1. TL;DR — get running

```bash
# one-time
brew install go node pnpm vips        # vips = libvips, for the image worker
brew install ollama
ollama pull qwen2.5:7b-instruct        # tool-calling-capable model
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
go install github.com/pressly/goose/v3/cmd/goose@latest
go install github.com/air-verse/air@latest
cp .env.example .env                   # then fill in any blanks

# every session
ollama serve                           # native, NOT in docker (GPU/Metal speed)
make up                                # postgres, minio, mailpit, mock-oidc, nbconvert, searxng
make migrate                           # goose up
make seed                              # demo workspace/projects/samples
make dev                               # Go API on :8080 + Vite SPA on :5173
```

Then open <http://localhost:5173>. Mailpit UI is at <http://localhost:8025>, MinIO console at
<http://localhost:9001>.

---

## 2. Prod → local service mapping

The single most important idea in local dev: **same protocol, different endpoint.** We do not
write "dev-only" code paths for these — we point the same client at a local server via env.

| Concern | Production | Local dev | How it stays identical |
|---|---|---|---|
| Database | Postgres 16 (EC2) | `postgres:16` (Compose) | Same SQL, same major version |
| Object storage | Amazon S3 | **MinIO** (Compose) | AWS SDK + `S3_ENDPOINT` override, path-style; presigned URLs work unchanged |
| Email | Amazon SES | **Mailpit** (Compose) | Standard SMTP; view mail at :8025 |
| Human SSO | Microsoft Entra OIDC | **mock-oauth2-server** (Compose) | Real OAuth2/PKCE; only `issuer`/`client_id`/`secret` env differ |
| External users | Local password (Argon2id) | same | Offline; no change between dev/prod |
| Agent auth (PAT) | Argon2id-hashed tokens | same | No external dependency |
| Internal AI auth | Short-lived token (spec §6.3) | same | No external dependency |
| AI completions | OpenRouter (global key) | **Ollama native** (`:11434`) | OpenAI-compatible `/v1/chat/completions` |
| Notebook render | nbconvert sidecar | **nbconvert container** (Compose) | Same HTTP contract |
| Web search (agent) | Brave / Tavily | **SearXNG** (Compose) | Same `web_search` tool shape, JSON API |
| Background jobs | River (in-process) | same | Postgres-backed; identical |
| Reverse proxy / TLS | Caddy on EC2 | none | Vite proxies `/v1` + `/openapi.json` to :8080 |
| Secrets | Sealed `.env` | `.env` (gitignored) | Same loader |
| Infra-as-code | Terraform | Compose + Makefile | Terraform authored in the prod phase |

### Why Ollama runs natively (not in Compose)

A containerized Ollama on a dev Mac cannot use the Metal GPU and is unacceptably slow. Run
`ollama serve` on the host; the Go API reaches it at `http://localhost:11434`. Everything else is
containerized for reproducibility.

### AI provider note

For now the AI orchestrator calls **Ollama directly** (no provider-abstraction layer). Because we
use Ollama's OpenAI-compatible endpoint, the eventual OpenRouter swap is contained to one file in
`internal/ai/`. Do **not** spread Ollama-specific assumptions across the codebase — keep the HTTP
client and request/response shaping in a single package so the prod swap stays a small change.

---

## 3. Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Go | 1.23+ | backend |
| Node + pnpm | 20+ | frontend |
| Docker + Compose | latest | local services |
| Ollama | latest | local LLM (native) |
| libvips (`vips`) | latest | image thumbnails (worker D3) |
| `sqlc` | latest | type-safe SQL codegen |
| `goose` | latest | DB migrations |
| `air` | latest | Go hot reload |
| `golangci-lint` + `depguard` | latest | lint + module-boundary enforcement |
| `openapi-typescript` | latest (pnpm) | TS types from `/openapi.json` |

---

## 4. Repository layout

```
/
├── cmd/api/                 # entrypoint: load .env, run goose, start chi+huma+River
├── internal/
│   ├── platform/            # huma setup, middleware (auth, audit, ratelimit, idempotency, etag), errors
│   ├── auth/                # OIDC (mock/Entra), JWT+refresh, local password, PAT, InternalAIToken
│   ├── audit/               # AuditLog writer + queries
│   ├── org/                 # workspaces, memberships, invites, ResolveAccess()
│   ├── project/             # B1
│   ├── iteration/           # B2 (+ IterationSample)
│   ├── page/                # B3: PageBlob, PageRevision, presence, GC
│   ├── sample/              # B4 (+ SampleRelation)
│   ├── experiment/          # B5 (+ ExperimentSample)
│   ├── artifact/            # B6 + D workers
│   ├── calendar/            # E: events, .ics, subscriptions
│   ├── ai/                  # G: ollama client, tools, SSE, workflow engine, metering
│   ├── mcp/                 # F3: MCP wrapping REST
│   └── db/                  # sqlc output, pgx pool, queries/*.sql
├── migrations/              # goose *.sql (run on boot behind advisory lock)
├── workflows/               # risk workflow JSON
├── web/                     # React SPA (Vite + TanStack + BlockNote)
│   └── src/{routes,components,api,mocks}
├── deploy/
│   ├── docker-compose.dev.yml
│   ├── nbconvert/Dockerfile
│   └── searxng/settings.yml
├── Makefile
├── .env.example
└── docs/
```

### Module boundary rule (enforced)

One module owns its tables. Cross-module access goes through the owning package's Go API; never
read another module's tables directly. Cross-module *reactions* (e.g. "page saved → reindex for
search") go through River jobs, not direct calls. A `depguard` lint rule blocks imports that
reach across module internals — keep it green.

---

## 5. Makefile commands

```
make up        # docker compose up -d (all services except ollama)
make ollama    # verify ollama is running and the model is pulled
make migrate   # goose up against local postgres
make seed      # load demo data (mirrors docs/design/data.jsx)
make api       # air-reload Go server on :8080
make web       # vite dev server on :5173 (proxies /v1 -> :8080)
make dev       # up + migrate + api + web together
make test      # go test ./... (throwaway testdb) + vitest
make openapi   # regenerate web/src/api types from /openapi.json
make down      # tear down the compose stack
```

---

## 6. Build order (track-by-track)

Build follows the spec's dependency graph (§9.2–9.3): **A → B → C → D → E → F → G**. Track C
(frontend) runs in parallel with Track B (backend) using MSW mocks generated from the OpenAPI
spec, then switches to the live API as endpoints land.

Each subtask must meet the **Definition of Done** (spec §9.5) before merge:
- compiles with no cross-module-boundary imports (`depguard` green);
- unit tests: happy path + ≥3 error paths;
- HTTP contract tests against a `testdb` Postgres for every new endpoint;
- OpenAPI updated;
- audit entry written for every mutation (asserted in test);
- permissions enforced server-side (tested, not just UI);
- a package README documenting the public interface.

### Track A — Core platform

- [x] **A0 Local infra** — `docker-compose.dev.yml` (postgres, minio, mailpit, mock-oidc,
  nbconvert, searxng), `.env.example`, `Makefile`. Goose runs on `cmd/api` boot behind a Postgres
  advisory lock. MinIO init job creates buckets `artifacts-originals`, `artifacts-rendered`.
  **Done when**: `make dev` serves a hello-world huma endpoint; `make up && make migrate` is
  idempotent.
- [x] **A1 Identity** — OIDC client (env-configured `issuer` → mock locally, Entra in prod),
  JWT + httpOnly refresh cookie, local password (Argon2id, mem ≥ 64 MB), `Invite` one-time link
  (emailed to Mailpit), allow-listed domains, PAT model, `InternalAIToken` minter (§6.3). Seed
  `dev@halide-lab.org` for fast login.
- [x] **A2 Audit** — `AuditLog` writer used by all later modules; queryable by actor/target/time;
  monthly-partition scaffolding (dormant until threshold).
- [x] **A3 Org** — workspaces, memberships, invites; `org.ResolveAccess(user, ws, project) → Role`
  (max of workspace/project/override); scope intersection for tokens.
- [x] **A4 API foundation** — chi + huma; middleware chain: auth → `slog` logging → audit hook →
  rate-limit → `Idempotency-Key` (24h TTL) → ETag/`If-Match`. Error envelope `{code,message,details}`.
  `/openapi.json`, `/docs`, `/llms.txt` stub.
- [x] **A5 Frontend shell** — Vite + React + TanStack Router/Query; auth gate (mock-OIDC + local
  password); shell from `design/shell.jsx` (sidebar, workspace switcher, project tree, topbar,
  ⌘K palette); `make openapi` codegen; MSW configured.

### Track B — Research data backend *(deps A1–A4)*

- [x] **B1 Projects** — CRUD, visibility (workspace|private), collaborators.
- [x] **B2 Iterations** — CRUD, ordering, status, start/end, `IterationSample` join.
- [x] **B3 Pages** — `PageBlob` (SHA-256, blocks-only JSONB) + immutable `PageRevision` graph with
  `markdownExport`; source enum; candidate/approve/reject; restore-as-new-revision; retention +
  nightly GC (River); ETag; `PagePresence` (SSE + 30s-TTL heartbeat); AI guardrails (§7.1.2).
- [x] **B4 Samples** — CRUD, freeform `properties` JSONB, `kind` enum, `SampleRelation` lineage +
  `/lineage` endpoint.
- [x] **B5 Experiments** — CRUD, `method` enum, `parameters` JSONB, `ExperimentSample` join,
  optional iteration link.
- [x] **B6 Artifacts** — presigned-URL handshake against MinIO; River processing job;
  `SampleArtifact`/`ExperimentArtifact` typed joins.

### Track C — Research data frontend *(parallel to B via MSW)*

- [x] **C1** Project list & detail (3 overview layouts from `design/project-overview.jsx`).
- [x] **C2** Iteration UI + sample-link picker.
- [x] **C3** Page UI: BlockNote with lab reference blocks (`@sample`/`@experiment`/`@artifact`,
  `createBlockSpec`, server-resolved), debounced auto-save (§7.1.4), presence indicator, history
  panel + diff/restore, ETag-aware save with 412 conflict UI.
- [x] **C4** Sample UI: cards/list, JSONB property editor, lineage graph (React Flow).
- [x] **C5** Experiment UI: method-specific parameter forms, sample+artifact pickers.
- [x] **C6** Artifact UI: upload (presigned → MinIO), PDF.js, sandboxed ipynb iframe, image lightbox.

### Track D — Artifact workers *(deps B6)*

- [x] **D1** PDF worker (`pdfcpu`): page count + first-page thumbnail.
- [x] **D2** ipynb worker: River handler → nbconvert container; rendered HTML to MinIO.
- [x] **D3** Image worker (`govips`): small + medium thumbnails. *Needs libvips: `brew install vips`.*

### Track E — Calendar *(deps A3, B1, B2)*

- [x] **E1** Events backend: `ProjectEvent` CRUD, RFC 5545 recurrence.
- [x] **E2** `.ics` feed: signed `GET /v1/cal/{user_id}/{token}.ics`, `CalendarSubscription`, slug
  rotation. Validate output with an ICS linter or a real calendar subscription.
- [ ] **E3** In-app calendar (FullCalendar): month/week/agenda.
- [ ] **E4** Timeline / Gantt (per-project + unified) from `design/calendar-view.jsx`.

### Track F — Agent surface *(deps A1, A4)*

- [x] **F1** PAT lifecycle UI (Settings → API Tokens) from `design/settings.jsx`.
- [x] **F2** OpenAPI polish: examples, descriptions, schema completeness, public `/docs`.
- [x] **F3** MCP server wrapping REST (SSE in-binary, same PAT auth/scopes). Test with an MCP
  client pointed at `http://localhost:8080/mcp`.
- [x] **F4** `/llms.txt` generated from OpenAPI.

### Track G — AI (local Ollama) *(deps A1, A4, F1)*

- [ ] **G1 Orchestrator** — Ollama client (`/v1/chat/completions`, OpenAI-compatible) with tool
  defs; tool registry; SSE streaming to the browser; internal-token minting; metering into
  `AIUsageRecord` (use Ollama's `prompt_eval_count`/`eval_count`; `usdCost = 0` locally).
- [ ] **G2 Tool gating** — read tools always on; write tools gated by `AutonomyConfig`. The AI
  calls the **public REST API** with its internal token (same path as external agents).
- [ ] **G3 Workflow engine** — JSON loader; step runner (`gather_context` → DB, `ai_question` →
  Ollama, `ai_synthesis` → markdown + schema-validated JSON); PI flag if
  `flagged_for_PI_review == true` OR `overall_rating >= 4` → Mailpit email + in-app notice.
- [ ] **G4 Workflow library** — `battery_safety_risk_v1`, `experimental_risk_v1`, `project_risk_v1`.
- [ ] **G5 Conversation service** — project-scoped message store, audited.
- [ ] **G6 AI chat UI** — `design/ai-panel.jsx`: streaming, citations, tool-call approval dialogs.
- [ ] **G7 Workflow runner UI** — `design/risk.jsx` + `design/create-flows.jsx` walkthroughs.
- [ ] **G8 Autonomy config UI** — workspace + project settings.

---

## 7. AI integration with Ollama

- **Endpoint**: `OLLAMA_BASE_URL=http://localhost:11434`, route `/v1/chat/completions`. Models via
  `AI_CHAT_MODEL` and `AI_WORKFLOW_MODEL` (default `qwen2.5:7b-instruct`).
- **Streaming**: Ollama supports `stream: true`; relay deltas to the browser over SSE from Go.
  This matches the production SSE design, so no frontend rework is needed for the OpenRouter swap.
- **Tool-calling reliability**: local 7B–14B models call tools less reliably than frontier models.
  Build in: strict JSON schemas on tool args, a repair/retry loop on invalid tool JSON, and low
  temperature for workflow synthesis. If a model won't tool-call cleanly, try `qwen2.5:14b` or
  `llama3.1:8b`.
- **Spend caps**: cost is 0 locally, but still implement the metering + cap-check logic (refuse at
  cap, soft-warn at 80%) against token counts so it is real and testable.
- **Web search**: `web_search` → SearXNG JSON API; `fetch_url` → server-side fetch with size and
  timeout limits.

---

## 8. Testing

- **Backend**: `go test ./...` against a throwaway `testdb`; HTTP contract tests per endpoint;
  permission + audit assertions per the DoD. River jobs tested with the in-process worker.
- **Frontend**: Vitest + Testing Library; **MSW** mocks the OpenAPI surface so Track C can proceed
  ahead of Track B, then runs against the live local API once endpoints exist.
- **AI**: workflow-engine unit tests stub the Ollama client with golden fixtures (deterministic,
  no model needed). An opt-in integration test (`go test -tags=ollama`) hits real Ollama to smoke
  test tool-calling.

---

## 9. End-to-end verification

1. `ollama serve` + `ollama pull qwen2.5:7b-instruct`.
2. `make up` → `make migrate` → `make seed`.
3. `make dev` → open <http://localhost:5173>.
4. **Auth**: log in via the mock-OIDC redirect *and* via local-password `dev@halide-lab.org`.
5. **Core slice**: workspace → project → iteration → sample (with lineage) → experiment → upload a
   PDF and an `.ipynb` (confirm thumbnail + nbconvert HTML render from MinIO).
6. **Editor**: insert `@sample`/`@experiment` reference blocks, edit, confirm auto-save creates a
   `PageRevision`; open history, diff, restore.
7. **AI chat**: ask a question → confirm SSE streaming + a `search_project_content` tool call with
   citations; in `suggest_writes` mode, have it draft a page → approve the candidate in the diff view.
8. **Risk workflow**: run `battery_safety_risk_v1` on a cell → confirm the rendered risk register
   page; if `rating >= 4`, confirm the PI-flag email in Mailpit (<http://localhost:8025>).
9. **Calendar**: create an event → `curl /v1/cal/{user}/{token}.ics` → validate RFC 5545.
10. **Agent**: create a PAT → call `/v1/projects` with `Authorization: Bearer pat_...`; point an
    MCP client at `/mcp` and list tools.
11. `make test` green; `/openapi.json` and `/docs` load; `depguard` passes.

---

## 10. Going to production (config swaps only)

These land in the production phase and are deliberately *config/endpoint swaps*, not application
rewrites:

- Terraform (VPC, 2× EC2, S3, SES, Route 53, IAM, EBS snapshots).
- Caddy + TLS (Let's Encrypt) reverse proxy.
- OIDC env → Microsoft Entra (`issuer`/`client_id`/`secret`).
- AI client → OpenRouter backend (contained to `internal/ai/`).
- Object storage → real S3 (drop the `S3_ENDPOINT` override).
- Email → SES (drop Mailpit).
- CloudWatch observability; sealed `.env`.

Because every local dependency in [§2](#2-prod--local-service-mapping) speaks the same protocol as
its production counterpart, this is a short, low-risk transition rather than a port.
