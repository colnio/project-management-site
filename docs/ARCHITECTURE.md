# Architecture (as-built)

This documents the system **as implemented today**, complementing the forward-
looking [`techSpec.md`](./techSpec.md). It is updated at each checkpoint.

## Shape

A **modular monolith**: a single Go binary (`cmd/api`) serving a chi + huma HTTP
API backed by one Postgres database, plus a React SPA in `web/`. Background
processing (River) and the AI orchestrator (`internal/ai`) are both in-process.

```
[ Browser SPA :5173 ] ──/v1, /openapi.json──▶ [ Go API :8080 ]
                                                 ├─ chi router + middleware chain
                                                 ├─ huma operations (OpenAPI 3.1)
                                                 ├─ domain modules (bounded contexts)
                                                 └─ pgx pool ──▶ [ Postgres :5432 ]
        MinIO :9000 (S3)  Mailpit :1025/8025 (SMTP)  mock-oidc :9100  nbconvert :8090
```

All external dependencies are reached through endpoint overrides in
`internal/config`, so the same code runs locally (MinIO/Mailpit) and in
production (S3/SES).

## Request lifecycle & middleware (`internal/platform`)

Order: `RequestID → slog request logger → Recoverer → CORS → AuthResolver →
RateLimiter → Idempotency → huma operation`.

- **AuthResolver** reads the `Authorization: Bearer` token and resolves a
  `Principal` onto the request context. Token kind is chosen by prefix: `pat_`
  (PAT), `iai_` (internal AI token), otherwise a first-party access JWT. A
  *missing* token is allowed (public routes); a *present but invalid* token is
  401. The `TokenVerifier` interface (satisfied by `auth.Service`) keeps
  `platform` free of an import cycle.
- **RateLimiter**: in-memory sliding window. Now covers all three caller kinds:
  PATs and internal-AI tokens are keyed by token value; first-party JWT browser
  sessions are keyed by user ID (`internal/platform/ratelimit.go`).
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
  internal-AI tokens. Access tokens are HS256 JWTs (carrying a `role` claim);
  refresh tokens are opaque, hashed, httpOnly cookies. Auth is **email/password
  only** (OIDC/Entra was removed). Users **self-register** via
  `POST /v1/auth/register` against an email-domain allowlist (`ALLOWED_EMAIL_DOMAINS`,
  default `nus.edu.sg,u.nus.edu`); new accounts are `status='pending'` and **cannot
  obtain a token** until approved. The **approval gate** is enforced at token
  issuance — `handleLogin` and `rotateRefresh` reject non-`approved` users with a
  typed 403 (`auth.pending_approval` / `auth.suspended`). On first login an
  approved user still gets a token but the SPA forces `/profile/setup`
  (`PATCH /v1/me/profile`) before app access.
- **Global roles.** `users.global_role` ∈ {`admin`,`pi`,`member`} replaces the old
  `is_system_admin` bool. `Principal.IsPrivileged()` (= admin∥pi) is the override
  used across modules (audit access, workspace/meeting/AI membership bypass) and
  gates workspace creation and the Risk-Assessment PI-review flag. The **admin**
  module (`/v1/admin/users`, scopes `read:admin`/`write:admin`, privileged-only)
  lists users and lets admins/PIs approve/suspend, change global role, and reject
  (delete) pending registrations, with self-lockout guards.
- **org** owns workspaces, memberships, project collaborations, admin overrides,
  and invites. `ResolveAccess(user, workspace, projectVisibility, project)`
  returns the effective role = **max** of (admin override → viewer, workspace
  role on workspace-visible projects, explicit collaborator role). Roles compose
  by rank: none < viewer < editor < owner.
- **Enforcement** is server-side on every mutation. For tokens, effective
  capability = `intersect(token scopes, owner's resolved permissions)`, re-checked
  per request. `project.Authorize` is the single helper every domain module uses.
- **Scope taxonomy and enforcement** (`internal/platform/scopes.go`). Every
  resource domain has a `read:<domain>` and `write:<domain>` scope. The full list
  is: `read:projects`, `write:projects`, `read:samples`, `write:samples`,
  `read:experiments`, `write:experiments`, `read:iterations`, `write:iterations`,
  `read:risks`, `write:risks`, `read:artifacts`, `write:artifacts`, `read:pages`,
  `write:pages`, `read:meetings`, `write:meetings`, `read:calendar`,
  `write:calendar`, `read:ai`, `write:ai`, `read:inbox`, `read:approvals`,
  `write:approvals`, `read:audit`, `read:admin`, `write:admin`,
  `admin:org`. The helper `platform.RequireScope(p, scope)` is called immediately
  after `platform.PrincipalFrom` in every authenticated huma handler. Enforcement
  rule: a token whose scope list is **non-empty** is fully restricted to those
  scopes; a token with an **empty/nil** scope list is treated as
  legacy-unrestricted (backward compatibility for tokens minted before scope
  enforcement). The internal-AI orchestrator token is minted with exactly the
  scopes its registered tools require: `read:projects`, `read:samples`,
  `read:experiments`, `read:pages`, `read:artifacts`, `write:pages`,
  `write:iterations`, `write:calendar`.

## Domain modules (Track B)

| Module | Tables | Notes |
|---|---|---|
| project | `projects` | visibility (workspace/private); `GetProject`, `Authorize` are the downstream contract; collaborator HTTP layers over org's Go API |
| iteration | `iterations`, `iteration_samples` | ordering by position, status, sample links |
| sample | `samples`, `sample_relations` | freeform JSONB `properties`; lineage graph endpoint traverses relations |
| experiment | `experiments`, `experiment_samples` | method enum, JSONB params, optional iteration link, sample/method filters |
| page | `pages`, `page_blobs`, `page_revisions`, `page_presence` | content-addressable (SHA-256 blob), immutable revision graph, ETag/If-Match (412), candidate approve/reject, non-destructive restore, presence heartbeat, auto-save GC; `GET /v1/projects/{id}/pages?parent_type=&parent_id=` returns `{items:[{id,project_id,parent_type,parent_id,title,updated_at,current_revision_id}]}` with titles derived from the markdown export |
| artifact | `artifacts`, `sample_artifacts`, `experiment_artifacts` | presigned MinIO upload handshake (create → PUT → complete); processing handed to Track D; typed attachment joins |
| calendar | `project_events`, `calendar_subscriptions` | event CRUD; signed per-user `.ics` feed at `/v1/cal/{user_id}/{token}.ics` (token is the bearer, no auth middleware), re-checking access via a synthetic principal |
| risk | `risks` | H1 — first-class Risk Register: likelihood/impact/mitigation/Plan B, PI-review flag, per-project `seq`; `source` human/ai with `workflow_run_id` link; AI workflows call `UpsertFromWorkflow` |
| meeting | `meetings` | H2 — workspace/project meetings; jsonb attendees/decisions/action_items; workspace-membership guard |
| inbox | _(read-only aggregation)_ | H2 — aggregates PI-flagged risks, proposed AI tool calls, audit entries, and pending approval requests into `GET /v1/workspaces/{id}/inbox` (owns no tables) |
| approval | `approval_requests` | Risk-assessment sign-off: stakeholder recipients snapshotted as jsonb (workspace members ∪ project collaborators); create emails recipients + audits; decide (approve/reject) by a recipient or project editor; pending requests surface in the inbox; workspace-scoped queries go through `project.ListIDsForWorkspace` |

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

## Background jobs (Track D)

**River** (Postgres-backed, in-process) runs artifact processing. Its schema is
migrated on boot (`internal/jobs.Migrate`, after the goose migrations); the
client starts with the API and stops on shutdown. When an artifact upload is
finalized (`POST /v1/artifacts/{id}/complete`), the artifact service enqueues a
`process_artifact` job through an `Enqueuer` interface (nil-safe so tests run
without River). The worker (`internal/artifact`) reads the original via an
`ObjectStore` abstraction (S3 impl in prod, in-memory fake in tests), then by
type: **PDF** → page count into metadata (pure-Go `pdfcpu`; no rasterized
thumbnail — pure-Go PDF rendering isn't available); **.ipynb** → POST to the
nbconvert sidecar, store HTML in the rendered bucket; **image** → small/medium
thumbnails via pure-Go `disintegration/imaging` (substituted for govips because
libvips/cgo isn't required locally — prod can swap back). Status moves
pending → processing → done|failed.

## AI (Track G — complete)

The agentic-chat backend (`internal/ai`, Tracks G1/G2/G5) is implemented:

- **Provider boundary.** A single OpenAI-compatible `Client` (`internal/ai/client.go`)
  is the only place that talks to a model — `Chat` (non-stream) and `ChatStream`
  (SSE). The active provider is loaded from `aiconf.local.json` (gitignored;
  `{active, <provider>:{model,token,api_base}}`); if absent, AI endpoints return
  503 and the server still boots. Swapping OpenRouter/Ollama/LiteLLM is a config +
  one-file change. A `stubClient` makes all tests deterministic with no live calls.
- **Same path as external agents.** When a chat message is sent, the service mints
  a short-lived **internal token** (`auth.MintInternalAIToken`, bound to the
  user+conversation) and the tool registry calls the **public REST API** at
  `127.0.0.1:<port>/v1/...` with that token (mirroring the MCP server). All
  middleware (auth, audit, rate-limit) applies; the user stays the audited
  principal via `ViaAIConversationID`. No service back door.
- **System prompt context.** When a message is submitted, `internal/ai/sse.go`
  injects a system message carrying the current `project_id`, project name,
  `workspace_id`, and date so the assistant answers project-scoped questions
  without asking the user to specify a project.
- **Skills.** A conversation may carry a `skill` (column on `ai_conversations`).
  Skill markdown lives in the embeddable `skills/` package (`skills/embed.go`,
  `LoadSkill`, same pattern as `workflows/`); when a conversation has a skill,
  sse.go appends that markdown verbatim after the context preamble as the system
  prompt (used by the Risk Register's "Review with AI", which seeds a
  `risk_assesment_skill` conversation). Falls back to the generic prompt if the
  skill is missing.
- **Synchronous risk review.** `POST /v1/projects/{id}/ai/risk-review` (`read:ai`)
  is a one-shot `Client.Chat` summary of the risk register in project context
  (not streamed) — used by the Send-for-approval dialog.
- **Tools.** Read tools (read/list samples, experiments, pages, artifacts,
  lineage, `search_project_content`, `list_projects`) are always available; write
  tools (`draft_page`, `update_iteration_status`, `create_reminder`,
  `flag_for_review`) are gated by `AutonomyConfig` (`read_only` | `suggest_writes`
  | `auto_routine` | `full`; a project may not exceed its workspace). In
  `suggest_writes`, writes are recorded as `proposed` tool calls for human
  approve/reject. `allTools`/`gatedTools`/`dispatchTool` in
  `internal/ai/tools.go` thread both `projectID` and `workspaceID`. The
  `draft_page` tool now posts valid BlockNote blocks.
- **Streaming.** `POST /v1/ai/conversations/{id}/messages` is a chi SSE route
  (not huma) emitting `token`/`tool_call`/`tool_result`/`warn`/`done`/`error`
  events; it runs a bounded tool-use loop (≤5 rounds).
- **Metering.** Every model call writes an `ai_usage_records` row (model, token
  counts, usd cost) with a per-workspace monthly spend cap (refuse at cap,
  soft-warn at 80%). Tables: `autonomy_configs`, `ai_conversations`, `ai_messages`,
  `ai_tool_calls`, `ai_usage_records` (00110–00114).

**Risk-assessment workflows (G3/G4).** JSON workflow definitions live in
`/workflows/*.json` (embedded, loaded at boot): `battery_safety_risk_v1`,
`experimental_risk_v1`, `project_risk_v1`. The step runner (`internal/ai/workflow.go`)
walks each step: `gather_context` (REST reads of the target sample/experiment/
project + lineage/experiments/artifacts/pages via a run-scoped internal token),
`ai_question` (low-temp model calls, JSON-parsed against the step's `expects`,
one repair retry), and `ai_synthesis` (markdown + a JSON object validated against
the workflow's `outputSchema`, one repair retry). PI review is flagged when the
synthesis emits `flagged_for_PI_review: true` **OR** `overall_rating >= 4` — which
emails the workspace PI (Mailpit/SES) and records a notice. The synthesis is
rendered as a Page on the target entity (`result_page_id`). Runs are stored in
`ai_workflow_runs` (00115) and execute synchronously for v1 (River-async is a
follow-up). On completion the engine also calls `risk.Service.UpsertFromWorkflow`
(wired via `ai.Service.SetRiskService`) to materialize AI-sourced rows in the
**Risk Register** — one risk per `category_ratings` entry, idempotent per run.
`GET /v1/ai/workflows` returns each definition's steps + `outputSchema` so the
Templates UI can render a step accordion and the schema. Endpoints:
`GET /v1/ai/workflows`, `POST /v1/ai/workflows/{key}/run`, `GET /v1/ai/runs/{id}`.

## Risk Register & workspace surfaces (Track H)

- **Risk Register (`internal/risk`).** A first-class entity surfaced on the
  Project Overview and the iteration page. Risks carry likelihood (high/med/low),
  impact headline + description, mitigation, Plan B, status, a PI-review flag, and
  a per-project human `seq`. Risks are either authored by a human or upserted by a
  risk workflow (`source='ai'`, linked by `workflow_run_id`). Activating an
  iteration is **blocked** (`409 iteration.blocked_by_risk`, enforced in
  `iteration.UpdateIteration`) while it has a HIGH risk flagged for PI review and
  still `open` — the PI sign-off gate.
- **Meetings (`internal/meeting`).** Workspace- and project-scoped meetings with
  jsonb attendees/decisions/action-items, guarded by workspace membership.
- **Inbox (`internal/inbox`).** A read-only aggregation (owns no tables) that
  unions PI-flagged risks, `proposed` AI tool calls, and recent audit entries into
  a single workspace feed; powers the Inbox page and the Home dashboard.
- **People** reuses `org` memberships, enriched with user email/display name.
- **Templates** are the AI workflow definitions surfaced as browsable pages.

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
the app shell (sidebar, workspace switcher, project tree, ⌘K palette — now also
indexes samples/experiments/pages for the active project), C1 project list/detail,
C2 iteration detail (+ sample-link picker), C4 sample detail (JSONB property
editor + React Flow lineage graph), C5 experiment detail (method-specific parameter
forms + sample picker; experiment rows now link to `/experiments/:id`), C6 artifacts
(presigned upload widget, PDF.js viewer, image lightbox, ipynb iframe, attachment
role pickers), C3 the BlockNote page editor — split into:

- **`PageEditorCore`** (`web/src/components/editor/PageEditorCore.tsx`) — shared
  save/ETag/presence/history logic, used by the `/pages/:pageId` route and by
  `EntityPageEditor`.
- **`EntityPageEditor`** (`web/src/components/editor/EntityPageEditor.tsx`) —
  load-or-creates a BlockNote page for an entity, keyed by `parent_type +
  parent_id + slot`. Pages carry a `slot` column (`''` for legacy/standalone,
  `'description'`/`'notes'` for entity sections). Project and iteration detail
  pages render three stacked sections: a `slot="description"` editor, a live
  imperative dashboard (`web/src/components/dashboards/`, with
  `IterationStatusControls` for iterations), and a `slot="notes"` editor.
  Experiment and sample pages render a single `slot="description"` editor. The
  `entityDashboard` BlockNote block remains registered so legacy single-doc pages
  (slot `''`) still load.
- Custom blocks: `sampleRef`/`experimentRef`/`artifactRef` (reference cards) and
  `imageEmbed`/`pdfEmbed`/`htmlEmbed` (inline attachments — HTML in a sandboxed
  `<iframe sandbox="allow-scripts">` via `ArtHTML`), all in `refBlocks.tsx`,
  inserted via the slash menu (Attachments group for embed blocks).

The sidebar **Notes** dropdown under each project (`AppShell.tsx`) lists the
project's pages via `useProjectPages` (backed by the new
`GET /v1/projects/{id}/pages` endpoint), linking to `/pages/:pageId`.

Also: F1 settings page (PAT create/list/revoke + calendar `.ics` subscription with
rotate); E3/E4 calendar views — a FullCalendar month/week/agenda calendar
(per-project and unified) plus a lightweight custom Gantt timeline (iterations as
date-positioned bars + event markers, per-project and unified; FullCalendar's
premium timeline is deliberately avoided); and the AI frontend (G6/G7/G8): a
per-project streaming **chat panel** (a fetch-based SSE reader renders token
deltas, tool calls/results, citations, spend warnings, and approve/reject on
proposed write tool-calls), a **workflow runner**, and **autonomy config**.
The **design-parity UX layer (H1–H3)** adds: a `RiskRegister` table on the
Overview/iteration pages; three Overview layouts (Editorial/Dashboard/Stream); a
**Tweaks panel** (theme/density/accent persisted to `localStorage` and applied via
`data-` attributes + CSS vars on `<html>`, with a full dark token set); the AI
chat panel **docked** as a right rail (reserving width via `--ai-w`) with citations
and a spend-cap meter; the new-project/new-iteration **wizards** (the iteration
wizard surfaces the HIGH-risk activation gate); a Home **dashboard** (project grid
+ PI-review panel + activity feed); and the workspace pages
(Inbox/People/Meetings/Admin/Templates). A root `errorComponent` keeps a component
throw from taking down the whole app. Template sidebar links use the correct
workflow keys (`battery_safety_risk_v1`/`experimental_risk_v1`/`project_risk_v1`).
OpenAPI TypeScript types are generated by `pnpm openapi`. MSW backs the Vitest
suite.

## Status

All v1 application tracks A–G are implemented. The remaining work is
productionization (the AWS/Terraform/Caddy infra and the SES/Entra/OpenRouter
config swaps in §10 of the spec), deliberately out of scope for this local-first
build.

## Production transition (config swaps only)

Per the spec, going to AWS is endpoint/config changes, not a rewrite: OIDC issuer
→ Entra, S3 endpoint dropped for real S3, SMTP → SES, AI client → OpenRouter
(a one-file swap inside `internal/ai/`), Terraform + Caddy added. Because every
local dependency speaks the same protocol as its production counterpart, the
transition is low-risk.
