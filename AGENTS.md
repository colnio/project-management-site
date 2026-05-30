# AGENTS.md — conventions for contributors and AI agents

This file is the contract for anyone (human or AI) adding code to this repo. It
captures the rules that keep the modular monolith coherent and that were learned
the hard way while building Tracks A–B in parallel. Read it before writing code.

## Golden rules

1. **One module owns its tables.** Never read or write another module's tables
   directly (no cross-module SQL, no cross-module FK to a sibling domain table).
   Cross-module access goes through the owning package's Go API. Cross-module
   *reactions* go through River jobs, not direct calls.
2. **Authorize through the chain.** Domain modules call
   `project.Authorize(ctx, principal, projectID, needRole)` which delegates to
   `org.ResolveAccessForPrincipal`. Effective role = max(admin override→viewer,
   workspace role on workspace-visible projects, collaborator role). Enforce on
   **every mutation, server-side** — UI checks don't count.
3. **Audit every mutation.** Accept an `audit.Recorder` and record an
   `audit.Entry` (action, resource_type, resource_id) for each write. Tests
   assert it (use a capturing fake recorder). This includes AI-driven mutations:
   the workspace-autonomy write was previously missing an audit entry — every
   write path, regardless of whether it is human- or AI-initiated, must emit one.
4. **Enforce scopes on every authenticated handler.** Immediately after
   `platform.PrincipalFrom`, call `platform.RequireScope(p, <scope>)` with the
   correct `read:<domain>` or `write:<domain>` scope. The full scope taxonomy is
   defined in `internal/platform/scopes.go`. PAT and internal-AI tokens with a
   **non-empty** scope list are fully restricted to those scopes (empty scopes
   were backfilled via migration `00132`; the legacy bypass is removed). Browser
   JWT sessions bypass scope checks. PAT management (`/v1/tokens`) and profile
   writes require `manage:tokens` / `write:profile` and are **session-only**
   (PAT/iai callers rejected). Do not add a new handler without a matching
   `RequireScope` call. Admin endpoints use `read:admin`/`write:admin`.
   **Production boot:** `config.Load()` refuses insecure defaults when
   `APP_ENV=production` (signing keys, cookie secure, MinIO creds).
   **Auth/roles:** email/password only (OIDC removed). `users.global_role` ∈
   {admin,pi,member} replaces `is_system_admin` — use `Principal.IsPrivileged()`
   (admin∥pi), `IsAdmin()`, `IsPI()` for global checks. Self-registration is
   domain-allowlisted and starts `status='pending'`; the approval gate lives at
   token issuance (`handleLogin`/`rotateRefresh`), not in middleware.
5. **AI calls the public API as the user.** Track G is built (`internal/ai`). The
   orchestrator never reaches into other modules' tables: it mints a short-lived
   internal token (`iai_`) and calls the public REST API at `127.0.0.1:<port>/v1`,
   so auth/audit/rate-limit/permissions apply uniformly. Write tools are gated by
   `AutonomyConfig`. New AI-driven side effects (e.g. risk-register population)
   should go through the owning module's exported Go API (see
   `risk.Service.UpsertFromWorkflow`, wired via `ai.Service.SetRiskService`), not
   cross-module SQL.
   - The AI system prompt is now injected with `project_id`, project name,
     `workspace_id`, and the current date by `internal/ai/sse.go` so the assistant
     answers project-scoped questions without prompting the user to specify a project.
     DB-sourced values in prompts are wrapped in XML tags and marked untrusted.
   - `allTools`/`gatedTools`/`dispatchTool` in `internal/ai/tools.go` all thread
     both `projectID` and `workspaceID`. When adding new tools, follow this
     signature and add them to the appropriate gate level.
   - The `draft_page` tool now posts well-formed BlockNote blocks; if you extend
     it, validate the block shape against the custom schema (`refBlocks.tsx`).

## Build & tooling

- Go module: `github.com/colnio/project-management-site`. **`go env -w GOTOOLCHAIN=auto`**
  is required — latest huma/pgx/goose need Go 1.25, fetched automatically.
- HTTP: **huma v2** over chi (OpenAPI 3.1 auto-generated). DB: **pgx v5** pool,
  hand-written SQL inside each module (sqlc config exists but is not a shared
  chokepoint). Migrations: **goose**, embedded in `/migrations`, run on boot
  behind a Postgres advisory lock.
- Don't run `go mod tidy`/`go get` while other agents work in parallel — it
  corrupts `go.mod`. Pre-fetch shared deps centrally first.

## Migrations

- One `*.sql` file per change in `/migrations`, goose format
  (`-- +goose Up` / `-- +goose Down`).
- **Numbers are strictly increasing and append-only.** Never insert a migration
  with a number lower than one already applied to any database — goose refuses
  out-of-order migrations ("missing migration before current version"). If you
  must renumber during development, fix the `goose_db_version` bookkeeping or use
  a fresh DB; never drop the shared `lab` DB.
- Per-module ranges already used: extensions 00001, idempotency 00025,
  audit 00010, auth 00020, org 00030–34, project 00040, iteration 00050–51,
  sample 00060, experiment 00070–71 (+ EX-N codes 00121), page 00080,
  artifact 00090, calendar 00100, AI 00110–115, risk 00120, meetings 00122,
  inbox indexes 00123, meetings kickoff 00124, pages.slot 00125,
  ai_conversations.skill 00126, approval_requests 00127,
  user accounts (global_role/status/profile) 00128, experiment tags 00130,
  notify 00131, PAT scope backfill 00132, rate_limit_hits 00133.
  Pick the next free range (≥00134) for new modules.
  Embeddable assets follow the `//go:embed` pattern: `workflows/` (workflow JSON)
  and `skills/` (skill markdown via `skills.LoadSkill`).
  The `page` module gained a new `GET /v1/projects/{id}/pages` endpoint (no new
  migration needed — reads existing `page_revisions`/`page_blobs` tables).

## huma gotchas (these crash at boot, not in unit tests)

- **No pointer types for `query`/`path`/`header` params.** Use value types
  (`string`, `time.Time`, …) and treat the zero value as "absent". Pointers are
  only allowed in request **bodies**.
- **Schema-name collisions across modules.** huma derives OpenAPI component
  names from Go type names (ignoring package), so two modules with, say,
  `linkSampleInput` collide. `platform.New` installs a custom schema namer that
  disambiguates anonymous body structs by signature, but prefer unique,
  module-prefixed input type names anyway.
- Registration-time bugs only surface when the router is built. **Always boot
  the server** (or register against a real huma API) as part of verification —
  isolated handler tests miss these.

## Module structure & wiring

- Expose `func Register(api huma.API, svc *Service)` and a `func NewService(...)`.
  **Do not edit `cmd/api/main.go` yourself** when working as a subagent — expose
  `Register`/`NewService` and let the orchestrator wire them (this avoids
  merge conflicts during parallel work). Non-huma routes (e.g. the public `.ics`
  feed) are exposed as an `http.HandlerFunc` and mounted on `srv.Router`.
- Cross-entity references to sibling domains are stored as **bare uuids** (no FK
  to sibling tables) so modules stay independent and parallel-buildable.
- Use the shared `platform` helpers: `Principal`/`PrincipalFrom`, error
  constructors (`NotFound`/`Forbidden`/`BadRequest`/`Conflict`/`Errorf`),
  `FormatETag`/`ETagMatches`/`PreconditionFailed`.

## Testing (Definition of Done per module)

- Compiles with no cross-module-boundary violations.
- Unit tests: happy path + ≥3 error paths; HTTP/permission/audit assertions.
- Use `testsupport.NewPool(t)` — it returns a migrated throwaway DB and **skips**
  cleanly if Postgres is down. The DB name comes from `TEST_DATABASE_URL`; give
  each package a distinct one (e.g. `lab_test_sample`) so parallel runs don't
  race on migrations. The full suite runs serialized: `go test ./... -p 1`.
- `make test` runs `go test ./... -p 1` and the frontend test step without `|| true`,
  so any failure in either backend or frontend fails the target. Do not suppress
  test failures.
- A package `README.md` documenting the public interface.

## Frontend (`web/`)

- Vite + React + TypeScript + TanStack Router/Query. Access token kept in memory
  (never localStorage); one-shot `/v1/auth/refresh` retry on 401. Types are
  generated from the live spec via `pnpm openapi` (openapi-typescript →
  `src/api/schema.d.ts`). MSW for tests; the app runs against the live API in dev.
- Work only under `web/`; never commit `node_modules`/`dist`.
- **Editor architecture:** `PageEditorCore` (`web/src/components/editor/PageEditorCore.tsx`)
  owns save/ETag/presence/history and is shared by the `/pages/:pageId` route and
  the new `EntityPageEditor` (`web/src/components/editor/EntityPageEditor.tsx`).
  Entity detail pages (project/iteration/experiment/sample) now render an
  `EntityPageEditor` — do not add separate tab-based content sections to those
  pages; extend the dashboard component (`web/src/components/dashboards/`) instead.
- The `entityDashboard` custom BlockNote block dispatches to the appropriate
  dashboard component. It is intentionally non-editable; KPIs, risk registers, and
  lineage graphs live there, not in the prose body.
- `imageEmbed`/`pdfEmbed`/`htmlEmbed` blocks upload via the artifact presigned
  handshake; `htmlEmbed` renders in `<iframe sandbox="allow-scripts">` only —
  never add `allow-same-origin`.

## Commits

- Small, coherent commits per track/module with a descriptive body. Co-author
  trailer `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`. Don't commit
  secrets, `.env`, `node_modules`, or `.DS_Store`.

## Documentation (standing requirement)

At every checkpoint, update `README.md`, this file, `docs/ARCHITECTURE.md`, and
`docs/USER_GUIDE.md` to match what's actually built. Keep the status table in
`README.md` honest about implemented vs pending.
