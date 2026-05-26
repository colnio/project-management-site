# Lab Project Management Platform

A web application for a physics / materials science / energy-storage research lab
to manage **projects, iterations, physical samples, experiments, and artifacts**
(PDFs, Jupyter notebooks, images), with an agent-friendly REST API, calendar
`.ics` subscriptions, and (later) AI-assisted risk workflows.

This repository is built **local-first**: every cloud dependency (S3, SES, Entra
SSO, OpenRouter, web search) has a local stand-in that speaks the same protocol,
so application code is written once and only configuration changes at deploy.
See [`docs/techSpec.md`](docs/techSpec.md) for the production design,
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the local build guide,
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the as-built system, and
[`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) for usage. Contributor/agent
conventions live in [`AGENTS.md`](AGENTS.md).

---

## Status

| Track | Scope | State |
|---|---|---|
| A0 | Infra scaffolding (compose, migrations-on-boot, Makefile) | ✅ done |
| A1 | Identity: users, Argon2id password, JWT+refresh, PAT, OIDC, invites | ✅ done |
| A2 | Audit log + admin query | ✅ done |
| A3 | Org: workspaces, memberships, invites, `ResolveAccess` | ✅ done |
| A4 | API middleware: auth, rate-limit, idempotency, ETag, error envelope | ✅ done |
| A5 | Frontend shell (Vite/React/TanStack, auth gate, ⌘K) | ✅ done |
| B1–B6 | Projects, iterations, samples+lineage, experiments, pages, artifacts | ✅ done |
| C1 | Project list & detail UI | ✅ done |
| C2 | Iteration UI (+ sample-link picker) | ✅ done |
| C4 | Sample UI (JSONB property editor + React Flow lineage) | ✅ done |
| C5 | Experiment UI (method param forms + sample picker) | ✅ done |
| C6 | Artifact UI (presigned upload, PDF.js, image lightbox, ipynb iframe) | ✅ done |
| C3 | Page editor (BlockNote with reference blocks) | ⛔ pending |
| D1–D3 | Artifact workers: PDF page count, ipynb render, image thumbnails (River) | ✅ done |
| E1–E2 | Calendar events + signed `.ics` feed | ✅ done |
| E3–E4 | In-app calendar + Gantt UI | ⛔ pending |
| F1 | PAT settings UI + calendar subscription | ✅ done |
| F3 | MCP server (in-binary SSE at `/mcp`, PAT auth) | ✅ done |
| F4 | `/llms.txt` generated from OpenAPI | ✅ done |
| F2 | OpenAPI examples/descriptions polish | ⛔ pending |
| G1–G8 | AI orchestrator, workflows, chat (Ollama) | ⛔ deferred (not started by design) |

The entire **non-AI backend** (Tracks A + B + D workers + E backend + F
MCP/llms.txt) is implemented, wired, and integration-tested: **51 REST
endpoints**, River-backed artifact processing, an MCP server wrapping the REST
API, server-side permissions and audit on every mutation, full Go test suite
green. The frontend covers the shell, projects, iterations, samples (+lineage),
experiments, artifacts (upload/viewers), and a settings page (PATs + calendar).

---

## Quickstart (local)

Prerequisites: Go 1.23+ (the build auto-upgrades the toolchain to 1.25),
Node 20+ with pnpm, Docker (Colima or Docker Desktop). `go env -w GOTOOLCHAIN=auto`
is required so the newer toolchain is fetched automatically.

```bash
# 1. Local services (postgres, minio, mailpit, mock-oidc, nbconvert, searxng)
make up                 # docker-compose up -d

# 2. Seed the dev login user (also runs migrations)
go run ./cmd/seed       # dev@halide-lab.org / devpassword

# 3. Backend API on :8080 (runs migrations on boot behind an advisory lock)
go run ./cmd/api

# 4. Frontend SPA on :5173 (proxies /v1, /openapi.json, /docs to :8080)
cd web && pnpm install && pnpm dev
```

Open <http://localhost:5173> and log in with `dev@halide-lab.org` / `devpassword`.
Mailpit UI: <http://localhost:8025>. MinIO console: <http://localhost:9001>.
OpenAPI: <http://localhost:8080/openapi.json>, docs at `/docs`.

### Tests

```bash
go test ./... -p 1        # backend (uses a throwaway lab_test DB; skips if no Postgres)
cd web && pnpm test --run # frontend (Vitest + MSW)
```

---

## Repository layout

```
cmd/api/            entrypoint: env -> pgx pool -> goose migrate -> chi+huma
cmd/seed/           idempotent demo-data seeder
internal/
  config/           single env loader (same in dev/prod, endpoints differ)
  db/               pgx pool + embedded goose runner
  platform/         huma setup, error envelope, auth/rate-limit/idempotency
                    middleware, ETag helpers, request Principal
  audit/            append-only AuditLog (Recorder interface used everywhere)
  auth/             OIDC, JWT+refresh, local password, PAT, internal-AI token
  org/              workspaces, memberships, invites, ResolveAccess()
  project/          B1 — projects, visibility, collaborators, Authorize()
  iteration/        B2 — iterations + IterationSample
  sample/           B4 — samples, freeform JSONB props, SampleRelation lineage
  experiment/       B5 — experiments + ExperimentSample
  page/             B3 — content-addressable PageBlob/PageRevision, presence, GC
  artifact/         B6 — presigned MinIO upload + typed attachment joins
  calendar/         E — ProjectEvent + signed per-user .ics feed
  mcp/              F — MCP server (SSE at /mcp) + /llms.txt generator
  jobs/             River migration helper (Postgres-backed background jobs)
  testsupport/      real-Postgres test pool (isolated DB per TEST_DATABASE_URL)
migrations/         goose *.sql (embedded; run on boot)
web/                React SPA (Vite + TanStack Router/Query)
deploy/             docker-compose.dev.yml, nbconvert sidecar, searxng config
docs/               techSpec, DEVELOPMENT, ARCHITECTURE, USER_GUIDE
```

Each `internal/<module>/` has its own `README.md` documenting its public Go API.

---

## Architecture in one paragraph

A **modular monolith**: one Go binary, one Postgres database, bounded-context
packages with isolated table ownership. Modules never read each other's tables —
cross-module access goes through the owning package's Go API (e.g. every domain
module authorizes through `project.Authorize` → `org.ResolveAccess`). The HTTP
contract is OpenAPI 3.1, auto-generated by huma; the frontend and external agents
consume the same spec. The in-app AI assistant (future Track G) will call the
same public REST API as external agents, authenticating with a short-lived
internal token. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
