# Security Review

Date: 2026-05-27

This document captures the findings from a risk-based review of the current
workspace state, including uncommitted local changes. It is a findings report,
not a remediation plan.

## Scope And Method

- Reviewed backend auth, authorization, AI autonomy, audit, data-boundary, and
  cross-module access paths.
- Reviewed frontend/backend contract alignment for calendar, meetings, AI
  streaming, workspace-scoped admin/settings, and embed sandboxing.
- Used static analysis plus local verification where possible.
- Verification baseline:
  - `go test ./... -p 1` passed.
  - `cd web && pnpm test --run` passed, with a React `act(...)` warning around
    `LoginPage`.
  - `cd web && pnpm build` passed, with large bundle warnings.
  - A direct local API probe confirmed that a PAT scoped only to `read:audit`
    could still access non-audit endpoints.

## Highest-Risk Findings

### 1. Workspace AI autonomy and usage endpoints are under-authorized

Severity: Critical

- `internal/ai/http.go`
- `internal/ai/service.go`

Any authenticated user can read workspace AI usage and read/write workspace
autonomy config by workspace ID. The HTTP layer checks only that the caller is
authenticated, and the service methods do not verify workspace membership or
role before reading or updating records.

Impact:

- Cross-workspace information disclosure for spend data and autonomy config.
- Unauthorized mutation of workspace AI autonomy settings.
- Workspace autonomy writes also bypass the repo rule that every mutation must
  emit an audit entry.

**Remediated 2026-05-27:** `internal/ai/service.go` now verifies workspace membership on all AI usage and autonomy reads; autonomy writes additionally require the `owner` role and emit an audit entry via the repo's standard `audit.Recorder` pattern.

### 2. PAT and internal-AI scopes are not enforced across most endpoints

Severity: Critical

- `internal/platform/principal.go`
- `internal/audit/http.go`
- `internal/org/http.go`

`Principal.HasScope` exists, but the codebase only checks it in the audit
endpoint. In a live probe, a PAT created with only `read:audit` scope could
still call `GET /v1/workspaces` successfully.

Impact:

- PAT and internal-AI scopes are effectively advisory for most of the API.
- Narrowly scoped tokens can access unrelated endpoints.

**Remediated 2026-05-27:** `internal/platform/scopes.go` defines a full `read:`/`write:` scope taxonomy (plus `read:audit`, `read:inbox`, `admin:org`) and a `platform.RequireScope(p, scope)` helper; every authenticated huma handler now calls it immediately after `platform.PrincipalFrom`. A token with a non-empty scope list is fully enforced; an empty/nil list retains legacy-unrestricted behaviour for backward compatibility. The internal-AI orchestrator token is minted with only the scopes its registered tools require.

### 3. OIDC callback does not verify `state`

Severity: High

- `internal/auth/http.go`

The login initiation endpoint generates a `state` value, but the callback
handler never checks that the returned `state` matches a server-side or
browser-bound value before exchanging the code.

Impact:

- Standard OIDC CSRF protection is missing.
- A valid provider callback can be accepted without proving it belongs to the
  user’s own login attempt.

**Remediated 2026-05-27:** `internal/auth/http.go` now sets an `HttpOnly; Secure; SameSite=Lax` `oidc_state` cookie at login initiation; the callback verifies the `state` query parameter equals the cookie value before code exchange, then clears the cookie.

### 4. Multiple write paths accept invalid cross-entity references

Severity: High

- `internal/artifact/artifact.go`
- `internal/meeting/http.go`
- `internal/risk/http.go`

Observed issues:

- Artifact attachment authorizes only the artifact’s project before attaching to
  a sample or experiment ID, so foreign target IDs are not validated against the
  same project.
- Meeting creation accepts any `project_id` after a workspace-membership check;
  it does not prove that the supplied project belongs to the workspace in the
  path.
- Risk creation accepts any `iteration_id` after authorizing only the project in
  the path.

Impact:

- Cross-project data corruption is possible through mismatched references.

**Remediated 2026-05-27:** Artifact attach now verifies the target sample/experiment shares the artifact’s project (`internal/artifact/artifact.go`); meeting create verifies the supplied `project_id` belongs to the path workspace (`internal/meeting/http.go`); risk create verifies the supplied `iteration_id` belongs to the path project (`internal/risk/http.go`).

### 5. `risk` and `inbox` violate module-boundary rules with direct cross-module SQL

Severity: High

- `internal/risk/http.go`
- `internal/inbox/inbox.go`
- `AGENTS.md`

The repo rule is that one module owns its tables and sibling-module access must
go through the owning package API. Current violations include:

- `risk` directly querying `iterations` to resolve authorization context.
- `inbox` joining `projects` and `risks` directly and querying `projects` from
  outside the owning modules.

Impact:

- Breaks the modular-monolith boundary contract.
- Makes future refactors and authorization changes easier to bypass by mistake.

**Remediated 2026-05-27:** `risk` now calls `iteration.GetProjectIDForIteration` instead of querying the `iterations` table directly; `inbox` now calls `risk.ListFlaggedForPIReviewByWorkspace`, `ai.ListProposedToolCallsByWorkspace`, and `project.ListIDsForWorkspace` instead of issuing cross-module SQL (`internal/inbox/inbox.go`).

## UI / API Contract Drift

### 6. Calendar subscription UI does not match backend contract

Severity: High

- `web/src/components/CalendarSubscriptionPanel.tsx`
- `web/src/hooks/useArtifactQueries.ts`
- `internal/calendar/http.go`

The UI sends `scope: "all"` and `scope: "selected"` and hardcodes copied `.ics`
links to `http://localhost:8080`. The backend accepts
`all_visible_projects` / `per_project` and returns a relative `ics_url`.

Impact:

- Scope updates are likely rejected or misrepresented.
- Copied calendar URLs break outside local dev.

**Remediated 2026-05-27:** `CalendarSubscriptionPanel.tsx` now sends the correct `all_visible_projects`/`per_project` enum values and constructs the `.ics` copy URL using `window.location.origin` instead of a hardcoded host.

### 7. Calendar “All projects” creation routes new events to the first project

Severity: High

- `web/src/pages/CalendarPage.tsx`

In all-project mode the create flow suppresses the project picker because it
always injects `allProjects[0]` as the initial project.

Impact:

- Users can create events under the wrong project without noticing.

**Remediated 2026-05-27:** `CalendarPage.tsx` now shows the project picker when creating events in all-project mode instead of silently defaulting to the first project.

### 8. Unified calendar silently truncates to the first three workspaces

Severity: High

- `web/src/pages/CalendarPage.tsx`

The unified project loader only reads `workspaces[0]`, `workspaces[1]`, and
`workspaces[2]`.

Impact:

- Users with 4+ workspaces see incomplete project, event, and iteration data.

**Remediated 2026-05-27:** `CalendarPage.tsx` now loads projects for all workspaces using `useQueries` (one query per workspace) instead of indexing the array by position.

### 9. Settings/Admin do not consistently use the selected workspace

Severity: High

- `web/src/hooks/useQueries.ts`
- `web/src/pages/SettingsPage.tsx`
- `web/src/pages/AdminPage.tsx`

The app has a persisted current-workspace abstraction, but these screens fall
back to `workspaces[0]` for some reads and mutations.

Impact:

- The UI can show one workspace while reading or mutating another.

**Remediated 2026-05-27:** `SettingsPage.tsx` and `AdminPage.tsx` now consistently derive the active workspace from the persisted current-workspace context rather than falling back to `workspaces[0]`.

### 10. Meeting form offers values the backend enum rejects

Severity: High

- `web/src/pages/MeetingsPage.tsx`
- `internal/meeting/http.go`

The UI offers `retrospective` and `kickoff`, while the backend only accepts
`sync`, `review`, `planning`, `retro`, and `other`.

Impact:

- Valid-looking UI selections can fail at submit time.

**Remediated 2026-05-27:** `MeetingsPage.tsx` now uses `retro` (matching the backend enum); the backend enum in `internal/meeting/http.go` was extended to also accept `kickoff` as a valid meeting kind.

### 11. AI streaming event payloads are inconsistent between backend and frontend

Severity: Medium

- `internal/ai/sse.go`
- `web/src/api/sseParser.ts`
- `web/src/components/AIChatPanel.tsx`
- `web/src/test/ai.test.ts`

The backend emits `tool_call_id` for `tool_call` events and omits an ID on
`tool_result`, while the frontend parser and UI expect `id`.

Impact:

- Streamed tool-call state cannot be matched reliably in the live UI.
- Approval and result rendering can drift from the actual tool invocation.

**Remediated 2026-05-27:** `web/src/api/sseParser.ts` now reads `tool_call_id` from `tool_call` SSE events (matching the backend field name), aligning the parser with what `internal/ai/sse.go` actually emits.

## Additional Security / Reliability Findings

### 12. Notebook/embed sandboxing is inconsistent with repo policy

Severity: Medium

- `web/src/components/ArtifactViewer.tsx`
- `web/src/components/embeds/ArtEmbeds.tsx`
- `AGENTS.md`

`ArtifactViewer` uses `sandbox="allow-scripts allow-same-origin"` even though
the repo policy explicitly says HTML embeds must use `sandbox="allow-scripts"`
only.

Impact:

- Rendered notebook/HTML content gets a materially larger execution surface.

**Remediated 2026-05-27:** The notebook `<iframe>` in `web/src/components/ArtifactViewer.tsx` (and `ArtEmbeds.tsx`) now uses `sandbox="allow-scripts"` only, removing `allow-same-origin`.

### 13. Inbox audit aggregation query is broken but swallowed

Severity: Medium

- `internal/inbox/inbox.go`

During local verification the server logged:

`operator does not exist: uuid = text (SQLSTATE 42883)`

The endpoint still returned `200`, meaning audit-derived inbox items are being
silently dropped.

Impact:

- Inbox data is incomplete while appearing healthy to the user.

**Remediated 2026-05-27:** The uuid/text type mismatch in the audit aggregation query in `internal/inbox/inbox.go` is fixed, and query errors are now propagated rather than swallowed — the endpoint returns a proper error instead of a silent partial response.

### 14. Rate limiting excludes first-party browser sessions entirely

Severity: Medium

- `internal/platform/ratelimit.go`

Only PAT and internal-AI callers are rate-limited. JWT browser sessions are not
limited at all.

Impact:

- Interactive sessions have no server-side throttle in the app layer.

**Remediated 2026-05-27:** `internal/platform/ratelimit.go` now applies rate limiting to first-party JWT browser sessions, keyed by user ID, in addition to PAT and internal-AI tokens.

### 15. `make test` is not a trustworthy verification gate

Severity: Medium

- `Makefile`
- `AGENTS.md`

`make test` runs `go test ./...` without the required `-p 1` and suppresses
frontend test failures with `|| true`.

Impact:

- A “green” top-level test command can hide real failures and migration-race
  regressions.

**Remediated 2026-05-27:** The `Makefile` `test` target now runs `go test ./... -p 1` and no longer appends `|| true` to the frontend test step, so failures in either backend or frontend fail the target.

## Testing Gaps

Backend packages with no package tests:

- `internal/risk`
- `internal/meeting`
- `internal/inbox`
- `internal/platform`

Frontend routes/components with no direct coverage for the reviewed issues:

- `CalendarSubscriptionPanel`
- `CalendarPage`
- `MeetingsPage`
- `SettingsPage`
- `AdminPage`
- live AI stream payload integration

Notable current warning:

- `LoginPage` test flow still emits a React `act(...)` warning even though the
  suite passes.

**Updated 2026-05-27 (post-remediation):** All four previously-untested backend
packages now have package tests: `internal/risk`, `internal/meeting`,
`internal/inbox`, and `internal/platform`. Additions to `internal/ai` and
`internal/auth` tests cover the new scope enforcement and OIDC state cookie
paths. Frontend tests were added for the fixed components
(`CalendarSubscriptionPanel`, `CalendarPage`, `MeetingsPage`,
`SettingsPage`/`AdminPage`, and the SSE parser). The `LoginPage` React `act(...)`
warning is resolved.

## Notes

- This document records the state observed during the review date above. It
  should be updated after material fixes or re-audits.
- No code changes were made as part of the review itself.
- **2026-05-27:** All 15 findings were remediated in a single pass (5 commits).
  Each finding's "Remediated" note above records the key file(s) changed. The
  Testing Gaps section above has been updated to reflect the new test backfill.
  This document should be treated as closed for this review cycle; open a new
  review after the next material feature or infrastructure change.
- **2026-05-27 (follow-up):** Running the newly-added package tests against a
  live Postgres (they had been silently skipping when the test DB was
  unreachable) surfaced bugs the green-but-skipped suite had masked: the
  Finding 5/13 inbox refactor left `risk.ListFlaggedForPIReviewByWorkspace`
  selecting an unqualified `id` across a `risks`/`projects` JOIN (inbox 500,
  SQLSTATE 42702); `org.uniqueSlug` panicked on slug collisions (`suffix[:6]`
  from a 4-char token); and the meeting `kind` enum gained `kickoff` in the API
  without the matching DB CHECK constraint (migration 00124). All fixed.
  Lesson: a "green" run that skips DB-backed tests is not a passing gate —
  ensure the package test databases are reachable when running the suite.
