# Architecture (as-built)

This documents the system **as implemented today**, complementing the forward-
looking [`techSpec.md`](./techSpec.md). It is updated at each checkpoint.

## Shape

A **modular monolith**: a single Go binary (`cmd/api`) serving a chi + huma HTTP
API backed by one Postgres database, plus a React SPA in `web/`. Background
processing (River) and the AI orchestrator are planned but not yet present.

```
[ Browser SPA :5173 ] ──/v1, /openapi.json──▶ [ Go API :8080 ]
                                                 ├─ chi router + middleware chain
                                                 ├─ huma operations (OpenAPI 3.1)
                                                 ├─ domain modules (bounded contexts)
                                                 └─ pgx pool ──▶ [ Postgres :5432 ]
        MinIO :9000 (S3)  Mailpit :1025/8025 (SMTP)  mock-oidc :9100  nbconvert :8090
```

All external dependencies are reached through endpoint overrides in
`internal/config`, so the same code runs locally (MinIO/Mailpit/mock-OIDC) and in
production (S3/SES/Entra).

## Request lifecycle & middleware (`internal/platform`)

Order: `RequestID → slog request logger → Recoverer → CORS → AuthResolver →
RateLimiter → Idempotency → huma operation`.

- **AuthResolver** reads the `Authorization: Bearer` token and resolves a
  `Principal` onto the request context. Token kind is chosen by prefix: `pat_`
  (PAT), `iai_` (internal AI token), otherwise a first-party access JWT. A
  *missing* token is allowed (public routes); a *present but invalid* token is
  401. The `TokenVerifier` interface (satisfied by `auth.Service`) keeps
  `platform` free of an import cycle.
- **RateLimiter**: in-memory sliding window, per-token only (first-party browser
  sessions are unlimited).
- **Idempotency**: for write methods carrying `Idempotency-Key`, captures the
  response and replays it on retry (Postgres-backed, 24h TTL).
- **Errors**: every error is the envelope `{code, message, details}` via a custom
  `huma.NewError`.
- **ETag/If-Match**: `FormatETag` / `ETagMatches` / `PreconditionFailed(current)`
  power optimistic concurrency (used by pages).

`Principal` is the single "who is acting" type for humans (JWT), external agents
(PAT), and the in-app AI (internal token) — only the `Via*` fields differ, which
keeps one HTTP code path for all three.

## Identity & permissions

- **auth** owns users, Argon2id local credentials, refresh sessions, PATs, and
  internal-AI tokens. Access tokens are HS256 JWTs; refresh tokens are opaque,
  hashed, and delivered as an httpOnly cookie. OIDC (mock locally / Entra in
  prod) provisions users from allow-listed email domains. Invite acceptance
  provisions a local-password user.
- **org** owns workspaces, memberships, project collaborations, admin overrides,
  and invites. `ResolveAccess(user, workspace, projectVisibility, project)`
  returns the effective role = **max** of (admin override → viewer, workspace
  role on workspace-visible projects, explicit collaborator role). Roles compose
  by rank: none < viewer < editor < owner.
- **Enforcement** is server-side on every mutation. For tokens, effective
  capability = `intersect(token scopes, owner's resolved permissions)`, re-checked
  per request. `project.Authorize` is the single helper every domain module uses.

## Domain modules (Track B)

| Module | Tables | Notes |
|---|---|---|
| project | `projects` | visibility (workspace/private); `GetProject`, `Authorize` are the downstream contract; collaborator HTTP layers over org's Go API |
| iteration | `iterations`, `iteration_samples` | ordering by position, status, sample links |
| sample | `samples`, `sample_relations` | freeform JSONB `properties`; lineage graph endpoint traverses relations |
| experiment | `experiments`, `experiment_samples` | method enum, JSONB params, optional iteration link, sample/method filters |
| page | `pages`, `page_blobs`, `page_revisions`, `page_presence` | content-addressable (SHA-256 blob), immutable revision graph, ETag/If-Match (412), candidate approve/reject, non-destructive restore, presence heartbeat, auto-save GC |
| artifact | `artifacts`, `sample_artifacts`, `experiment_artifacts` | presigned MinIO upload handshake (create → PUT → complete); processing handed to Track D; typed attachment joins |
| calendar | `project_events`, `calendar_subscriptions` | event CRUD; signed per-user `.ics` feed at `/v1/cal/{user_id}/{token}.ics` (token is the bearer, no auth middleware), re-checking access via a synthetic principal |

Cross-entity references between sibling domains are stored as bare uuids (no
cross-module FK), so modules stay independently testable and buildable.

## Agent surface (Track F)

- **`/llms.txt`** is generated at boot from the live OpenAPI spec
  (`mcp.LLMSText(api.OpenAPI())`), so it always enumerates the actual registered
  endpoints grouped by tag, plus PAT auth instructions.
- **MCP server** (`internal/mcp`, using `mark3labs/mcp-go`) is mounted at `/mcp`
  over SSE. It exposes read-only tools (`list_projects`, `search_project_content`,
  `list_samples`, `read_sample`, `get_sample_lineage`, `list_experiments`,
  `read_experiment`, `read_page`, `list_artifacts`). Each tool **wraps the REST
  API**: it makes an HTTP call to `127.0.0.1:<port>/v1/...` forwarding the MCP
  client's PAT (extracted from the connection's `Authorization` header), so the
  full middleware chain (auth, audit, rate-limit, permissions) applies uniformly —
  no service-call back door. Write tools are intentionally absent (gated by AI
  autonomy config, Track G).

## Data & storage

- **Postgres** is the single source of truth. Pages use git-style content
  addressing: one `page_blobs` row per unique canonical block JSON (SHA-256 key);
  `page_revisions` reference a blob plus metadata; `markdown_export` lives on the
  revision (renderer-independent hash).
- **Object storage**: artifacts upload directly to MinIO/S3 via presigned PUT
  URLs (path-style, endpoint override). Buckets `artifacts-originals` and
  `artifacts-rendered` are created by a compose init job.
- **Audit**: `audit_log` is append-only; monthly RANGE partitioning is documented
  as the >50M-row upgrade path but ships unpartitioned.
- **Migrations** run on boot from an embedded FS behind `pg_advisory_lock`, so
  multiple booting instances serialize and the operation is idempotent.

## Frontend (`web/`)

Vite + React + TypeScript + TanStack Router/Query. Auth context holds the access
token in memory with a one-shot refresh on 401. Implemented against the live API:
the app shell (sidebar, workspace switcher, project tree, ⌘K palette), C1 project
list/detail, C2 iteration detail (+ sample-link picker), C4 sample detail (JSONB
property editor + React Flow lineage graph), and C5 experiment detail
(method-specific parameter forms + sample picker). OpenAPI TypeScript types are
generated by `pnpm openapi`. MSW backs the Vitest suite.

## Not yet built

- **Track D** artifact workers (PDF/ipynb/image) — requires River wired in.
- **Track C3/C6** frontend (BlockNote page editor with reference blocks, artifact
  upload/viewers) and **E3–E4** in-app calendar/Gantt UI.
- **Track F1/F2** PAT settings UI and OpenAPI examples polish (F3 MCP + F4
  `/llms.txt` are done).
- **Track G** AI orchestrator, risk workflows, chat (Ollama) — intentionally
  deferred.

## Production transition (config swaps only)

Per the spec, going to AWS is endpoint/config changes, not a rewrite: OIDC issuer
→ Entra, S3 endpoint dropped for real S3, SMTP → SES, AI client → OpenRouter
(contained to a future `internal/ai/`), Terraform + Caddy added. Because every
local dependency speaks the same protocol as its production counterpart, the
transition is low-risk.
