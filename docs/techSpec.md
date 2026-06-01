# Lab Project Management Platform — Technical Spec (v1.1)

> **What changed from v1.0** (summary of resolved decisions; full list at bottom in §12):
> - Hosting simplified: 1–2 EC2 boxes instead of App Runner + RDS + Lambda + Secrets Manager.
> - Apple Calendar via per-user `.ics` subscription URL; CalDAV dropped. Google Calendar moves to the same `.ics` mechanism for v1.
> - LLM auth model specified: short-lived internal tokens minted per conversation, scoped to the calling user.
> - Lab-specific BlockNote reference blocks (`@sample`, `@experiment`, `@artifact`) are in v1.
> - Page versioning simplified: `Page.blocks` denorm dropped; `markdownExport` lives on `PageRevision`; auto-save debounced.
> - Single-editor conflicts: ETag-based optimistic locking **plus** presence indicator.
> - Webhooks deferred to v2.
> - Sample properties stay freeform JSONB; canonical keys per `kind` is a v2 candidate (LLM workflows will extract from page prose for now — flagged as a known weakness).
> - External users: Microsoft Entra for university SSO; admin allow-lists external emails which then use local password accounts.
> - Audit log kept forever in Postgres; partitioned by month after > 50M rows.
> - Terminology: `iteration` everywhere (code and UI).
> - Workflow templates: JSON files in repo.
> - Secrets: sealed `.env` on the VPS.
> - Realistic build budget: **two engineers, ~4–5 months for v1**.

---

## 1. Overview

A web application for a physics / materials science / energy storage research lab to manage **projects**, **iterations**, **physical samples**, **experiments**, and **supporting artifacts** (PDFs, Jupyter notebooks, images) — augmented with **LLM-assisted risk workflows + an agentic project assistant**, **calendar integration via `.ics` subscription**, and a **first-class agent-friendly API**.

- **Target users**: 10–30 researchers in year 1 — primary lab + external collaborators.
- **Deployment**: AWS-hosted on 1–2 EC2 instances (Go API + React SPA + S3 for artifacts).
- **Auth**: University Microsoft 365 SSO (university users), local password accounts (external invitees), Personal Access Tokens (agents).
- **Editing**: Notion-style block editor (BlockNote) with lab-specific reference blocks.
- **LLM**: Provider-agnostic via OpenRouter; single global key; per-workspace spend caps & autonomy controls. Internal LLM uses the same public API as external agents.
- **Calendar**: In-app timelines + per-user `.ics` subscription URL consumable by Google / Apple / Outlook calendars.
- **Agent-friendly**: Comprehensive REST + MCP, scoped PATs, OpenAPI 3.1, `/llms.txt`. (Webhooks deferred.)

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Go** (chi router) | Single-binary deploys, fast, great concurrency for LLM streaming + sync jobs |
| Database | **PostgreSQL** | `jsonb` for page content + sample properties, native FTS, durable |
| SQL layer | sqlc + pgx | Type-safe SQL, no ORM overhead |
| API framework | huma | Auto-generates OpenAPI 3.1 from Go handlers |
| Migrations | goose | Versioned schema; runs on container startup behind a Postgres advisory lock |
| Background jobs | **River** (Postgres-backed) | No Redis needed, durable, Go-native, in-process worker |
| Frontend | **React SPA** (Vite + TanStack Router + TanStack Query) | Required for BlockNote |
| Block editor | **BlockNote** | Notion-like UX; supports custom inline blocks |
| Auth (humans) | Microsoft Entra ID OAuth2 + local password fallback + JWT | Uni SSO + external invitees |
| Auth (agents) | Personal Access Tokens, scoped | Standard for agent integrations |
| Auth (internal LLM) | Short-lived internal tokens (see §6.3) | Same HTTP path as external agents |
| File storage | **Amazon S3** | Direct browser uploads via presigned URLs |
| LLM | **OpenRouter** — single **global** API key | Provider-agnostic; admin-paid (see §7.5.1) |
| MCP server | Go MCP SDK (`mcp-go`) | Wraps the REST API; same auth, same scopes |
| Web search (for agent) | Brave Search API or Tavily | Cheap, agent-friendly |
| Calendar export | Per-user signed `.ics` URL | One code path; consumed by Google, Apple, Outlook |
| Notebook rendering | `nbconvert` Python sidecar container on the app box | Always-on, no Lambda overhead |
| Backend hosting | **EC2** (Ubuntu, t4g.small or t4g.medium) | Simplest at this scale |
| Frontend hosting | **S3 static website** behind the same EC2 reverse proxy (Caddy), or direct S3 + CloudFront if traffic grows | Cheap |
| Database hosting | **Postgres 16 on EC2** (separate small instance) | Cheaper than RDS at this scale; nightly EBS snapshots |
| Secrets | **Sealed `.env` file** loaded at boot | Simple; manual rotation |
| Email | **Amazon SES** | Transactional email for invites/notifications |
| Infra-as-code | Terraform | Reproducible EC2 + S3 + SES + IAM + Route 53 |
| CI/CD | GitHub Actions → EC2 (rsync binary + systemd reload) + S3 sync | No ECR, no registry hop |

**Estimated monthly AWS cost at year-1 scale: ~$50–80** plus OpenRouter usage (capped per workspace; see §7.5.1). Full breakdown in §8.2.

---

## 3. User Roles

**System-level**
- `user` — standard researcher.
- `admin / PI` — `user` plus override visibility into all content in designated workspaces (every access logged).

**Workspace-level** (per membership): `owner` / `admin` / `member`.
**Project-level** (per access grant, used for private projects): `owner` / `editor` / `viewer`.

---

## 4. Domain Model

```
User
 ├─ WorkspaceMemberships
 ├─ ProjectCollaborations
 ├─ PersonalAccessTokens
 └─ LocalCredential?           (set if external invitee with password)

Invite                         (admin allow-lists external email → invite link → set password)
 ├─ email, invitedBy, workspace
 ├─ tokenHash, expiresAt
 └─ acceptedAt?, acceptedAsUser?

Workspace                      (anyone can create; users belong to many)
 ├─ Members
 ├─ Projects
 └─ AutonomyConfig (workspace default)

Project                        (inside a Workspace)
 ├─ visibility: workspace | private
 ├─ Collaborators
 ├─ SummaryPage
 ├─ Samples                      (first-class — see §4.1)
 ├─ Iterations
 ├─ Experiments
 ├─ Pages
 ├─ Artifacts
 ├─ Events
 ├─ AIConversations
 └─ AutonomyConfig (overrides workspace)

Iteration                      (a.k.a. Milestone — but UI also says "Iteration")
 ├─ project
 ├─ status: planned | active | done | blocked
 ├─ startAt, endAt
 ├─ SummaryPage
 ├─ IterationSamples             (join: which samples this iteration touches)
 └─ Events

IterationSample                (join — a sample can be in many iterations)
 ├─ iteration, sample
 ├─ role: input | output | passthrough     (optional)
 └─ note

Sample                         (e.g., precursor, electrode, cell, derivative)
 ├─ project
 ├─ identifier, name, description
 ├─ kind: precursor | electrode | cell | module | derivative | other
 ├─ properties (JSONB)            ← FREEFORM in v1; canonical keys per kind is v2
 ├─ DescriptionPage
 ├─ status: active | consumed | archived | failed
 └─ createdBy, createdAt

SampleRelation                 (lineage graph)
 ├─ parentSample, childSample
 ├─ relationType: derived_from | split_from | assembled_into | tested_as | duplicate_of
 ├─ project (denormalized for query + permissions)
 └─ notes

Experiment                     ("what was actually done")
 ├─ project
 ├─ iteration?
 ├─ method: cycling | synthesis | SEM | XRD | EIS | weighing | drying | custom
 ├─ parameters (JSONB)            (free-form in v1; typed schemas v2)
 ├─ resultSummary (text)
 ├─ NotesPage?
 ├─ ExperimentSamples             (join: which samples were involved)
 ├─ performedBy, performedAt
 └─ status: planned | in_progress | completed | failed

ExperimentSample               (join — many samples per experiment, role-tagged)
 ├─ experiment, sample
 ├─ role: subject | reference | control | byproduct
 └─ note

Artifact                       (file scoped to a project)
 ├─ project
 ├─ type: pdf | ipynb | image | other
 ├─ originalUrl, renderedUrl, thumbnailUrl
 ├─ sizeBytes, metadata
 └─ uploadedBy, uploadedAt

SampleArtifact                 (typed attachment — many-to-many)
 ├─ sample, artifact
 ├─ role: specimen_image | datasheet | reference | other
 └─ attachedBy

ExperimentArtifact             (typed attachment — many-to-many)
 ├─ experiment, artifact
 ├─ role: raw_data | analysis | report | calibration | photo | other
 └─ attachedBy

Page                           (block editor surface)
 ├─ id, parentRef (project | iteration | sample | experiment)
 ├─ currentRevisionId           ← single source of truth
 ├─ etag (recomputed on currentRevision change)
 └─ updatedAt
 (see §7.1.1)

PageBlob                       (content-addressable; one row per unique blocks content)
 ├─ hash (sha256 of canonical blocks JSON, PK)
 ├─ blocks (JSONB)              ← ONLY canonical blocks; nothing else hashed
 └─ sizeBytes

PageRevision
 ├─ id, page
 ├─ blobHash (FK PageBlob)
 ├─ markdownExport (TEXT)       ← lives here, NOT in PageBlob (renderer-independent hash)
 ├─ parentRevision (FK, nullable)
 ├─ source: human | ai | auto_save | restore | import
 ├─ status: current | superseded | candidate | rejected
 ├─ author (User)
 ├─ aiToolCall (FK, nullable — set when source = ai)
 ├─ restoreOf (FK, nullable — set when source = restore)
 ├─ label (text, nullable: "pre_ai_safety_point", "approved_by_PI", …)
 ├─ retentionClass: keep_forever | keep_with_gc
 └─ createdAt

PagePresence                   (in-memory or short-TTL Postgres; see §7.1.3)
 ├─ page, user
 ├─ since, lastHeartbeat
 └─ clientId

AuditLog                       (every API call, every LLM tool call, every admin override)
 ├─ id, actor (user), via_token? (PAT id), via_ai_conversation? (LLM internal token)
 ├─ action, resourceType, resourceId
 ├─ requestPayloadDigest, responseStatus
 └─ createdAt                   (partitioned by month past 50M rows)

ProjectEvent
 ├─ project, iteration?, sample?, experiment?
 ├─ kind: deadline | milestone_end | meeting | reminder | custom
 ├─ title, description, startAt, endAt, allDay
 ├─ recurrenceRule (RFC 5545)
 └─ createdBy

CalendarSubscription           (per user — one signed .ics URL)
 ├─ user, token (random URL-safe slug, used as bearer in URL)
 ├─ scope: all_visible_projects | per_project (list)
 ├─ revokedAt?
 └─ lastFetchedAt

AIWorkflow                     (risk-assessment template, loaded from JSON files at boot)
 ├─ key, title, description
 ├─ steps (loaded), outputSchema (loaded)
 └─ scope: system

AIWorkflowRun
 ├─ workflow, project?, sample?, experiment?, startedBy
 ├─ status, stepResults (JSONB), output (JSONB)
 └─ resultPage? (rendered Page)

AIConversation
 ├─ project, startedBy
 └─ messages (JSONB)

AIToolCall
 ├─ conversation or workflowRun
 ├─ tool, inputJson, outputJson
 ├─ status: proposed | approved | executed | rejected
 └─ executedBy

AutonomyConfig
 ├─ scope: workspace | project
 ├─ mode: read_only | suggest_writes | auto_routine | full
 └─ allowedTools (text[])

PersonalAccessToken
 ├─ user, name
 ├─ tokenHash
 ├─ scopes (text[])
 ├─ expiresAt?, revokedAt?, lastUsedAt
 └─ rateLimit (optional override)

InternalAIToken                (see §6.3 — minted per LLM conversation/run)
 ├─ user, conversationOrRunId
 ├─ tokenHash, scopesSnapshot (text[]), permissionsSnapshot (JSONB)
 ├─ expiresAt (~15 min, renewable)
 └─ revokedAt?

AIUsageRecord
 ├─ workspace, project?, user, token?, internalAIToken?
 ├─ feature: chat | workflow | tool_call
 ├─ model, promptTokens, completionTokens, usdCost
 └─ createdAt

IdempotencyKey                 (write replay protection)
 ├─ tokenId | userId, key (composite PK)
 ├─ responseStatus, responseBody (JSONB)
 ├─ createdAt (24h TTL, GC'd nightly)
```

### 4.1 Why samples and experiments are first-class

In a battery / materials lab, a sample isn't a child of a single iteration — it has a **lifecycle**: precursor → electrode → cell → cycling → post-mortem → derivative. It moves through multiple phases, gets used in many experiments, accumulates artifacts, and may be referenced in risk reviews and meetings long after the iteration that created it has closed.

Modeling samples as first-class under the project (with `IterationSample` to link them into iterations, and `SampleRelation` to capture lineage) lets you ask the questions a lab actually asks — *what's this sample's full history? which experiments has it been through? what did it derive from?* — without duplicating sample records across iterations.

The **Experiment** entity captures the missing middle layer: a structured record of *what was actually done*. Cycling protocols, SEM scans, XRD measurements, syntheses, weighings — each is a row with parameters (JSONB) and a clear link to the samples involved and the artifacts produced. Without this, all that information ends up in unstructured page bodies and filenames, and search / LLM context / reproducibility / risk workflows all degrade.

---

## 5. Permissions

Project access resolves as:
```
hasAdminOverride(user, workspace)
    → grant + audit log

OR isWorkspaceMember(user, workspace)
    AND project.visibility = 'workspace'
    → role inferred from workspace membership

OR isProjectCollaborator(user, project)
    → explicit project role
```
Effective role = **highest** of (workspace, project, override). Roles compose by max; **scopes** then filter the resulting capability set.

Enforcement is **server-side on every mutation**.

**For API tokens**: effective capability = `intersect(token.scopes, owner's resolved permissions)`. A token can never grant more than its owner has at the moment of the request (re-resolved per request — no caching of stale permissions).

**For LLM tool calls**: additionally gated by `AutonomyConfig`. Admin override grants visibility into LLM runs (logged).

---

## 6. Authentication

### 6.1 University users (Microsoft Entra SSO)
- Microsoft Entra ID OAuth2; PKCE flow from the React SPA.
- Sign-in restricted to allow-listed email domains (university + any externally allow-listed domains).
- Short-lived JWT + httpOnly refresh cookie.

### 6.2 External invitees (local password accounts)
- An admin enters an external email into the workspace invite UI.
- System generates an `Invite` row and emails a one-time invite link (signed token, 7-day expiry).
- External user clicks the link → sets a password → account created → joins the workspace.
- Password hashing: Argon2id with sensible parameters (memory ≥ 64 MB).
- Local accounts have all the same JWT/refresh semantics as SSO accounts after sign-in.
- Optional TOTP 2FA in v1.1 (post-launch).

### 6.3 Internal LLM auth
The in-app LLM assistant calls the same HTTP API as external agents. To do that, the orchestrator authenticates as the user:

- When an LLM conversation starts (or a workflow run begins), the orchestrator mints an **internal token**:
  - Bound to `(user_id, conversation_or_run_id)`.
  - Captures a **snapshot** of the user's effective permissions at that instant.
  - TTL ~15 minutes, renewable while the conversation is active.
  - Stored as a hashed row in `InternalAIToken`.
- The orchestrator passes this token as `Authorization: Bearer iai_...` on every call to the API.
- Auth middleware treats it like a PAT, except:
  - Higher per-minute rate limit (default 600/min).
  - `AuditLog` records `actor=user_id, via_ai_conversation=<id>` — the user remains the principal.
  - Tokens are revoked when the conversation ends, the user closes the chat, or the workflow completes.
- **Why this matters**: external agents and the in-app LLM share one HTTP code path. Any middleware (idempotency, ETag, rate limiting, audit) applies uniformly. No "back door" through Go service calls.

### 6.4 Agent auth (PATs)
- Generated in **Account Settings → API Tokens**: user names the token, picks scopes, optional expiry, gets a one-time secret.
- Argon2id-hashed at rest. Revokable any time.
- Sent via `Authorization: Bearer pat_...` header.
- Last-used timestamp + recent-activity log in the UI.
- Default per-token rate limit: 60/min, 1000/hour. Configurable per workspace.

---

## 7. Key Features

### 7.1 Block editor

**BlockNote** in React. Content stored as JSONB; markdown export regenerated on save and stored on `PageRevision` (used for FTS + portability).

**Standard blocks**: headings, paragraphs, lists, code, inline images, LaTeX (KaTeX), tables, callouts, embeds, slash commands, drag-to-reorder.

#### 7.1.1 Lab-specific reference blocks (in v1)
The editor ships custom block types that turn the surface from "generic Notion clone" into "lab tool":

- `@sample:<sample_id>` — inline mention or card; renders sample identifier, kind, status, link to detail.
- `@experiment:<experiment_id>` — inline mention or card; renders method, samples, result summary preview.
- `@artifact:<artifact_id>` — card; renders thumbnail + filename + uploaded-by/date.

These give the LLM's `search_project_content` results structured citation back to entities, and let researchers cross-link without typing IDs by hand. Implemented as BlockNote custom blocks (`createBlockSpec`); resolved server-side on render so stale references display gracefully.

#### 7.1.2 Page versioning & LLM rollback

Every page change creates an **immutable revision**. Storage is **content-addressable** (git-style): the canonical block JSON is stored once in `PageBlob` keyed by SHA-256, and `PageRevision` rows reference a blob with metadata.

**Important simplifications (v1.1)**:
- **No `Page.blocks` denormalization.** Reads join `Page → currentRevision → blobHash → PageBlob`. At 30 users this is microseconds; one source of truth.
- **`markdownExport` lives on `PageRevision`**, not `PageBlob`. Changing the markdown renderer doesn't invalidate blob hashes.
- **Auto-save is debounced** — see §7.1.4.

**Revision sources**:
- `human` — explicit user save in the editor.
- `ai` — written by the LLM agent or a workflow run.
- `auto_save` — debounced background save.
- `restore` — non-destructive revert.
- `import` — bulk import or initial seed.

**LLM safety guardrails**:
- Before the LLM's first write to a page in any session, the prior current revision is labeled `pre_ai_safety_point` and pinned (immune from GC).
- In `suggest_writes` mode: LLM writes create a **candidate** revision (not current) that the user approves in a diff view. Reject keeps the candidate for audit.
- In `auto_routine` / `full` modes: LLM writes become current immediately, but each LLM revision links to its originating `AIToolCall`.
- **Runaway protection**: if **N consecutive LLM revisions on the same page** happen without an intervening human revision (default N=3), the orchestrator pauses further LLM writes on that page until a human reviews. Per-page-session; revisions inside a single `AIWorkflowRun` are exempt (a multi-step workflow may legitimately write 5 intermediate revisions to a page).

**Retention** (defaults; configurable per workspace later):
- All revisions: **kept forever** by default. Disk is cheap; trust in the LLM undo story is not. PI can opt into GC later.
- `auto_save` revisions: rolling window, keep last 20 per page, GC nightly.

**One-click recovery**:
- "Undo last LLM edit" button surfaces whenever the current revision has `source = ai`.
- **Page history panel**: timeline of revisions with source, author/tool, timestamp, label, content size; diff against any other revision; restore to any.
- Restore is itself a new revision (non-destructive).

#### 7.1.3 Conflict handling (multi-user editing)

Pages have an `etag` derived from `currentRevisionId`. On save:
1. Client sends `If-Match: <etag>` with the new blocks.
2. Server compares against current; on mismatch returns `412 Precondition Failed` with the current revision payload.
3. UI shows a diff (their changes vs the page's current state) and lets the user merge / overwrite / abandon.

Additionally, a **presence indicator** runs over a WebSocket (or SSE + heartbeat) per open page:
- `PagePresence` rows expire after 30s of no heartbeat.
- UI shows "Alice and Bob are editing" without hard-locking.
- No real-time CRDT co-editing in v1 (explicit non-goal).

#### 7.1.4 Auto-save policy

- Client debounces edits at 10s of idle.
- Auto-save writes a new `PageRevision` ONLY on:
  - 10s idle after the last edit, OR
  - Window blur, OR
  - Tab close (via `navigator.sendBeacon`), OR
  - Explicit Ctrl/Cmd-S.
- Keystroke-by-keystroke local state stays in the React store; the blob store is never written for transient state.

**API additions** (extending §7.6):
```
GET    /v1/pages/{id}/revisions                       (list, cursor-paginated)
GET    /v1/revisions/{id}                             (full content + metadata)
GET    /v1/revisions/{id}/diff?against={other_id}     (computed diff)
POST   /v1/pages/{id}/restore                         (body: { revision_id })
POST   /v1/pages/{id}/candidates/{cand_id}/approve
POST   /v1/pages/{id}/candidates/{cand_id}/reject
```

**Token scopes**: `read:page_revisions`, `write:page_restore`. LLM write tools (`draft_page` etc.) keep needing `write:pages` plus their `AutonomyConfig` gate.

### 7.2 Artifact pipeline

1. Browser → S3 via Go-issued presigned URL.
2. Go records artifact; River enqueues processing.
3. Processing by type:
   - **PDF** → page count + first-page thumbnail (`pdfcpu`).
   - **.ipynb** → POST to local `nbconvert` sidecar HTTP service on the app box (always-on Python container managed by systemd); store rendered HTML in S3.
   - **image** → small + medium thumbnails (`govips`).
   - **other** → generic icon.
4. DB row updated with `renderedUrl`, `thumbnailUrl`, metadata.

Viewers: PDF.js, sandboxed iframe for ipynb HTML, native `<img>` + lightbox.

**Why a sidecar instead of Lambda**: at this scale, a 200 MB Python container running on the same box adds ~$0/month and removes a packaging boundary, an IAM role, a VPC config, and a cold-start. If nbconvert volume grows beyond what the app box can handle, we can lift it to its own EC2 or move to Lambda later — but not before.

### 7.3 Calendar & Timelines

Three surfaces:
1. **Project timeline** — Gantt-style: iterations as bars, events as markers.
2. **Unified timeline** — aggregated across every project the user can see.
3. **Calendar view** — month/week grid (FullCalendar React).

**External calendar integration (one-way, push-pull via .ics)**:

Each user has a **`CalendarSubscription`** with a signed, secret URL slug. Endpoint:
```
GET  /v1/cal/{user_id}/{token}.ics
```
Returns an RFC 5545 `.ics` stream containing every event in the user's scope (defaults to all visible projects; configurable in settings to a chosen subset). Users paste this URL into:
- **Google Calendar** → "Add by URL".
- **Apple Calendar** → "Subscribe to Calendar…".
- **Outlook** → "Add calendar from internet".

**Why this over CalDAV / OAuth in v1**:
- Single code path for all three providers; no per-provider OAuth or app-specific passwords.
- No encrypted credential storage; no KMS dependency.
- Setup is one paste, not an OAuth handshake.

**Known limitations** (documented to users):
- Refresh is on the provider's schedule. Google refreshes subscribed `.ics` calendars every ~12 hours (sometimes longer); Apple refreshes every 5–60 min. Acceptable for deadlines and iteration boundaries; **not** acceptable for "I just created this event, where is it?" expectations.
- Token rotation: user can rotate the URL slug in settings, which invalidates the old subscription.

**v2 candidates**: Google Calendar OAuth for real-time push; Apple two-way sync via CalDAV.

### 7.4 LLM: Risk Assessment Workflows

Predefined, structured workflows the LLM walks the user through. Each is a **JSON file** in the repo (`/workflows/*.json`) loaded at server boot. Results saved as a structured record **and** rendered as a Page on the target entity.

Workflow template (example, JSON):
```json
{
  "key": "battery_safety_risk_v1",
  "title": "Battery Cell Safety Risk Assessment",
  "description": "Walks through thermal runaway, electrolyte, voltage, and storage risks.",
  "scope": "system",
  "steps": [
    {
      "id": "sample_context",
      "type": "gather_context",
      "sources": ["sample", "sample_lineage", "recent_experiments", "related_artifacts", "recent_iteration_pages"]
    },
    {
      "id": "thermal_runaway",
      "type": "ai_question",
      "prompt": "Given the sample chemistry and recent cycling artifacts, assess thermal runaway risk on a 1–5 scale and list mitigations.",
      "expects": {"rating": "int", "mitigations": "list[string]"}
    },
    { "id": "electrolyte_handling", "type": "ai_question", "prompt": "..." },
    { "id": "summary", "type": "ai_synthesis", "output_format": "markdown" }
  ],
  "outputSchema": {
    "overall_rating": "int",
    "category_ratings": "object",
    "mitigations": "list[string]",
    "flagged_for_PI_review": "boolean"
  }
}
```

**PI review flagging logic**:
A workflow output is flagged for PI review if **either**:
- The LLM emits `flagged_for_PI_review: true` in the synthesis output, **OR**
- `overall_rating >= 4`.

The deterministic threshold provides a floor the LLM can't talk us out of; the LLM flag provides ceiling judgment for cases that don't trip the threshold. Either path sends an email via SES + in-app notification to the workspace PI.

**Sample-properties caveat (v1)**: because `Sample.properties` is freeform JSONB, the `gather_context` step assembles prose context — page bodies, artifact metadata, the JSONB blob serialized — and lets the LLM extract chemistry / mass / voltage from prose. This is **fragile** and a known v1 weakness. The risk: an LLM rating is only as reliable as its context extraction. **v2 candidate**: canonical typed keys per `kind` (chemistry, mass_g, capacity_mah, voltage_window_v) populated from sample forms.

Initial seeded library:
- `battery_safety_risk_v1`
- `experimental_risk_v1`
- `project_risk_v1`

Runtime (Go): walks each step; `gather_context` → DB queries; `ai_question` → OpenRouter with assembled context; `ai_synthesis` → markdown summary + structured JSON validated against `outputSchema`.

### 7.5 LLM: Agentic Project Assistant

Surface: per-project chat panel. **The assistant authenticates with an internal LLM token and calls the public REST API** (§6.3). Same endpoints, same scopes, same audit as external agents.

**Read tools** (always available):
- `search_project_content(query)`, `read_page(id)`, `read_sample(id)`, `get_sample_lineage(sample_id)`, `list_experiments(sample_id?)`, `read_experiment(id)`, `list_artifacts(parent_type, parent_id)`, `read_artifact_summary(id)`, `web_search(query)`, `fetch_url(url)`.

**Write tools** (gated by `AutonomyConfig`):
- `draft_page(parent_id, content)`, `update_iteration_status(id, status)`, `create_reminder(payload)`, `flag_for_review(reason)`.

**Autonomy modes** (per workspace; project override allowed but never *more* permissive than workspace):
- `read_only` — search/analyze only. **Default**.
- `suggest_writes` — agent proposes writes; human approves each.
- `auto_routine` — agent auto-executes a whitelist of low-risk tools; content writes still proposed.
- `full` — agent executes all whitelisted tools.

Implementation: OpenRouter tool-calling API; responses streamed via **SSE** from Go; every tool call recorded in `AIToolCall`.

#### 7.5.1 LLM cost & key model

**The OpenRouter API key is global** — single key in the sealed `.env` on the app box, used by the orchestrator for *all* LLM calls. The lab pays centrally; users do not bring keys.

**Per-workspace config**:
- **Model selection** — which OpenRouter model to use. Default seeded (suggest Claude Sonnet for the workflow runs; cheaper model for chat).
- **Monthly spend cap (USD)** — orchestrator refuses new requests once exceeded; soft-warn at 80%.
- **Per-call timeout & max tokens.**
- **AutonomyConfig.**

**Tracking** (`AIUsageRecord`): per-request model, prompt tokens, completion tokens, USD cost, attribution to user + workspace + project + feature. Aggregated dashboards.

**v2 (out of scope)**: per-workspace BYO-key, chargeback.

### 7.6 Agent-Friendly API

**Principle**: every action a human can take through the UI is available through a documented API. The internal LLM assistant uses the same surface.

**API conventions**:
- Versioned: `/v1/...`.
- JSON in/out, no envelope.
- Cursor-based pagination (`?cursor=...&limit=...`).
- **Idempotency keys** on writes (`Idempotency-Key` header) — stored in `IdempotencyKey` with 24h TTL.
- Structured errors: `{ "code": "sample.not_found", "message": "...", "details": {...} }`.
- ETags on resources; conditional requests (`If-Match`) for optimistic concurrency.
- **OpenAPI 3.1** auto-generated by huma, served at `/openapi.json`. Interactive docs at `/docs`.

**Token scopes**:
- `read:workspaces`, `read:projects`, `read:samples`, `read:experiments`, `read:artifacts`, `read:pages`, `read:page_revisions`, `read:events`
- `write:pages`, `write:page_restore`, `write:samples`, `write:sample_relations`, `write:experiments`, `write:artifacts`, `write:events`, `write:iterations`
- `ai:run_workflow`, `ai:converse`
- `admin:tokens` (rare)

(No `admin:webhooks` — webhooks deferred to v2.)

Per-token rate limit: default 60/min, 1000/hour (configurable per workspace).

**Key endpoints (sketch)**:
```
GET    /v1/workspaces
GET    /v1/workspaces/{id}/projects
GET    /v1/projects/{id}
POST   /v1/projects/{id}/iterations
GET    /v1/projects/{id}/samples
POST   /v1/projects/{id}/samples
GET    /v1/samples/{id}
PATCH  /v1/samples/{id}
GET    /v1/samples/{id}/lineage
POST   /v1/samples/{id}/relations
POST   /v1/iterations/{id}/samples
DELETE /v1/iterations/{id}/samples/{sid}
GET    /v1/projects/{id}/experiments
POST   /v1/projects/{id}/experiments
GET    /v1/experiments/{id}
PATCH  /v1/experiments/{id}
POST   /v1/experiments/{id}/samples
POST   /v1/samples/{id}/artifacts
POST   /v1/experiments/{id}/artifacts
POST   /v1/projects/{id}/artifacts          (presigned-URL handshake)
GET    /v1/pages/{id}
PUT    /v1/pages/{id}                       (replace; requires If-Match)
PATCH  /v1/pages/{id}                       (JSON-patch; requires If-Match)
GET    /v1/pages/{id}/revisions
POST   /v1/pages/{id}/restore
POST   /v1/projects/{id}/events
GET    /v1/projects/{id}/events
GET    /v1/cal/{user_id}/{token}.ics        (per-user calendar feed)
POST   /v1/ai/workflows/{key}/run
GET    /v1/ai/runs/{id}
POST   /v1/ai/conversations/{id}/messages
GET    /v1/search?project={id}&q=...
```

**MCP server**: thin wrapper around the REST API. Same auth (PAT in header), same scopes, same permission model. Default transport: **SSE in-binary** (one less process); sidecar binary is a v2 option if isolation becomes valuable.

**Discovery**:
- `/llms.txt` at the site root (per 2026 convention).
- OpenAPI spec linked from the HTML root.

**Audit**:
- Every API call attributed to `(actor=user, via_token | via_ai_conversation, scope)` in `AuditLog`.
- Token UI shows last-used + recent activity (paginated).

**Webhooks**: **deferred to v2.** No outgoing webhook surface ships in v1. When added, design will follow standard HMAC-signed, retry-with-backoff, delivery-log conventions.

---

## 8. Architecture

```
                                  ┌──► Microsoft Entra ID (uni SSO)
[ Browser / Agent / Claude Code ] ─┤
        │                         └──► PAT / local password / internal LLM token (in-API)
        │   HTTPS, SSE for LLM streaming, presigned uploads direct to S3
        ▼
[ Route 53 ] ──► [ EC2 #1: app box ]
                    ├─ Caddy (TLS, reverse proxy, serves SPA static)
                    ├─ Go API (chi + huma)
                    │   ├─ HTTP handlers (versioned, OpenAPI-described)
                    │   ├─ MCP server (/mcp, wraps REST)
                    │   ├─ Domain services (modular packages)
                    │   ├─ LLM orchestrator (OpenRouter client + tool dispatch)
                    │   └─ River worker (in-process)
                    ├─ nbconvert sidecar (Python container, systemd-managed)
                    └─ .env (sealed; OpenRouter key, OAuth secrets, signing keys)

[ EC2 #2: postgres box ] ◄── private SG ── [ EC2 #1 ]
   ├─ Postgres 16
   └─ nightly EBS snapshot

[ S3 ]
   ├─ artifacts-originals
   ├─ artifacts-rendered
   └─ frontend (optional; can also serve from Caddy)

[ SES ]      transactional email
[ OpenRouter ]   LLM completions + tool calling
[ Brave / Tavily ]  web search (for agent)
```

### 8.1 Deployment specifics

**Compute**
- **EC2 #1 — app box**: t4g.small or t4g.medium (Graviton). Runs Go binary under systemd, Caddy as reverse proxy + TLS, nbconvert Python sidecar (container or venv). Frontend SPA built by CI and rsync'd to disk; served by Caddy.
- **EC2 #2 — db box**: t4g.small. Postgres 16 listening on a private SG only reachable from EC2 #1. Daily EBS snapshot, 7-day retention. (For year-1 simplicity you *could* collapse to one box, but separating now avoids a tricky migration later when DB resource needs diverge.)
- **VPC**: one VPC, two subnets (public for app, private for db). One Elastic IP on EC2 #1; Route 53 A-record points at it.

**Data**
- **S3** with separate buckets: `artifacts-originals`, `artifacts-rendered`, `frontend` (optional). Server-side encryption (SSE-S3). Versioning on the artifact buckets.
- **Backups**: nightly EBS snapshots of the db box's data volume (crash-consistent). S3 versioning on artifacts. **Known tradeoff**: EBS snapshots without `pg_basebackup` or `fsfreeze` are crash-consistent, not transactionally-consistent — restore may lose up to a few seconds of writes. Plus RPO is ~24h. **Upgrade path**: switch to nightly `pg_dump → S3` (or `pgBackRest` continuous WAL archiving) once data becomes irreplaceable or write volume grows. This is a 1-day task and a tracked v1.1 candidate.

**Secrets**
- **Sealed `.env`** file on EC2 #1, mode 0400, owned by the app user. Contains: OpenRouter API key, Entra ID client secret, magic-link signing key, JWT signing key, SES creds.
- Manual rotation; document the runbook.
- An AWS KMS-encrypted blob in S3 + decryption on boot is an easy upgrade path if more rigor is needed.

**Email**
- **SES** for transactional email (workspace invites, PI flag-for-review, password resets, magic links). Out of sandbox before launch.

**Observability**
- **CloudWatch agent** on both EC2s for system metrics + log forwarding.
- Structured JSON logs from Go (`slog`).
- **CloudWatch alarms**: 5xx rate, EC2 CPU > 80%, free disk < 20%, OpenRouter spend (custom metric).

**CI/CD**
- GitHub Actions:
  - Backend: build Go binary (cross-compile to linux/arm64) → SCP to EC2 #1 → systemd reload.
  - Frontend: `vite build` → SCP to EC2 #1 disk (or `aws s3 sync` to frontend bucket).
  - Migrations: run on backend container/binary startup behind a Postgres advisory lock — no separate deploy step.
- Terraform: VPC, EC2s, security groups, S3, SES identities, Route 53, IAM, snapshot schedule. PR previews use a separate stack (or `prod`-only if budget is tight).

### 8.2 Estimated monthly AWS cost

| Service | Estimate |
|---|---|
| EC2 #1 t4g.small (24/7) | $13 |
| EC2 #2 t4g.small (24/7) | $13 |
| EBS volumes (50 GB total) | $5 |
| EBS snapshots (7-day retention, ~100 GB) | $5 |
| S3 + transfer | $5–10 |
| SES (low volume) | <$1 |
| Route 53 (1 hosted zone + queries) | $1–2 |
| CloudWatch (logs + alarms) | $5 |
| **Total AWS** | **~$50–80** |
| OpenRouter (variable, capped per workspace) | $0–$X |

**Region**: pick one close to the lab and matching any data-residency agreements. All resources in a single region for v1.

---

## 9. Development Plan

The system is built as a **modular monolith with bounded contexts** — separate Go packages with explicit interfaces, isolated table ownership, and independent test suites. Each subtask is testable in isolation; integration through agreed contracts (HTTP API + Go interfaces). "Microservices spirit" without microservices cost.

### 9.1 Principles

- **One module owns its tables.** No cross-module direct reads/writes — calls go through the owning module's Go package API.
- **The HTTP contract is OpenAPI.** Frontend and external agents consume the same `/openapi.json`; TypeScript types generated from it.
- **Cross-module reactions go through River jobs**, not direct function calls. Keeps modules decoupled, gives free retry semantics.
- **Mocks at the seams.** Every module exposes a Go interface; adjacent modules use a fake implementation in tests.
- **Per-subtask Definition of Done** (§9.5) before merge.

### 9.2 Subtask Tracks

#### Track A — Core platform

- **A0. Infrastructure** *(no deps)* — Terraform: VPC + 2 EC2 + S3 + SES + Route 53 + IAM + EBS snapshot schedule. GitHub Actions pipelines. Caddy on EC2 #1 with TLS via Let's Encrypt. Postgres install + tuning on EC2 #2. Acceptance: hello-world Go binary deploys end-to-end through CI; `terraform apply` idempotent; `.env` resolves at runtime.
- **A1. Identity** *(A0)* — Entra ID OAuth, JWT + refresh, local password auth (Argon2id), `Invite` flow with one-time link, allow-listed domains, PAT model.
- **A2. Audit** *(A1)* — `AuditLog` writer interface used by every later module. Queryable by actor, target, time. Monthly partitioning scaffolding in place (activated when row count threshold reached).
- **A3. Org** *(A1)* — Workspaces, memberships, invites. **Permissions resolver**: `org.ResolveAccess(user, workspace, project) → Role`.
- **A4. API foundation** *(A1)* — chi + huma; middleware chain (auth, logging, audit hook, rate-limit, idempotency keys with `IdempotencyKey` store, ETag). OpenAPI 3.1 emitter + `/docs`. Structured error envelope.
- **A5. Frontend shell** *(A1, A4)* — Vite + React + TanStack Router + TanStack Query. Auth gate (Entra + local), layout, navigation skeleton, OpenAPI codegen pipeline.

#### Track B — Research data backend *(deps: A1–A4)*

- **B1. Projects** — CRUD, visibility, collaborators.
- **B2. Iterations** — CRUD, ordering, status, `startAt`/`endAt`, `IterationSample` join.
- **B3. Pages** — `PageBlob` (content-addressable, blocks-only) + `PageRevision` (immutable graph, with `markdownExport`). Source enum (human/ai/auto_save/restore/import), candidate/approve flow, restore-as-new-revision, retention policy + GC job, ETag emission, `PagePresence` channel. See §7.1.
- **B4. Samples** — Sample CRUD, JSONB properties, kind enum. `SampleRelation` lineage. Lineage query endpoint.
- **B5. Experiments** — CRUD with method enum + parameters JSONB. `ExperimentSample` join with role. Optional iteration link.
- **B6. Artifacts** — Project-scoped `Artifact`, presigned-URL upload handshake, processing-job emission. `SampleArtifact` + `ExperimentArtifact` typed attachment joins with role.

#### Track C — Research data frontend *(parallel to B against mocks)*

- **C1. Project list & detail UI**
- **C2. Iteration UI** — with sample-link picker
- **C3. Page UI** — read view + BlockNote edit view with **lab-specific reference blocks** (`@sample`, `@experiment`, `@artifact`), debounced auto-save (§7.1.4), presence indicator, history panel + diff/restore, ETag-aware save with conflict UI
- **C4. Sample UI** — list, detail, JSONB property editor, **lineage graph viz** (React Flow)
- **C5. Experiment UI** — list/detail, method-specific parameter forms (cycling / SEM / XRD / EIS / synthesis / custom), sample-and-artifact attachment pickers, result-summary editor
- **C6. Artifact UI** — upload widget, PDF.js viewer, ipynb iframe, image lightbox, attachment role pickers

Built against MSW mocks before B is done.

#### Track D — Artifact processing workers *(deps: B6)*

- **D1. PDF worker** — `pdfcpu`: page count + first-page thumbnail.
- **D2. ipynb worker** — Python container running `nbconvert`; HTTP interface to River handler.
- **D3. Image worker** — `govips` thumbnails.

#### Track E — Calendar *(deps: A3, B1, B2)*

- **E1. Events backend** — `ProjectEvent` CRUD, RFC 5545 recurrence.
- **E2. `.ics` feed endpoint** — signed per-user URL, RFC 5545 stream, `CalendarSubscription` storage, slug rotation in settings.
- **E3. In-app calendar UI** — FullCalendar React.
- **E4. Timeline / Gantt UI** — per-project + unified.

(No CalDAV worker, no Google OAuth in v1.)

#### Track F — Agent surface *(deps: A1, A4)*

- **F1. PAT lifecycle UI** — Settings → API Tokens.
- **F2. OpenAPI polish** — examples, descriptions, schema completeness, public `/docs`.
- **F3. MCP server** — wraps existing HTTP routes; SSE in-binary; same PAT auth, same scopes.
- **F4. `/llms.txt`** — static, generated from OpenAPI.

(No F-track webhook subtask — deferred to v2.)

#### Track G — LLM *(deps: A1, A4, F1)*

- **G1. LLM orchestrator core** — OpenRouter client, tool registry, SSE streaming, spend metering, **internal-token minter** (§6.3).
- **G2. Tool gating** — read tools always on; write tools gated by `AutonomyConfig`.
- **G3. Workflow engine** — JSON loader, step runner (`gather_context` / `ai_question` / `ai_synthesis`), output validator, PI-flag computation (LLM flag OR `overall_rating >= 4`).
- **G4. Workflow library content** — `battery_safety_risk_v1`, `experimental_risk_v1`, `project_risk_v1` (prompts authored with the PI).
- **G5. Conversation service** — message store scoped to project, audit.
- **G6. LLM chat UI** — per-project panel, streaming, tool-call approval dialogs.
- **G7. Workflow runner UI** — pick workflow, step-by-step view, result render.
- **G8. Autonomy config UI** — workspace + project settings.

### 9.3 Dependency graph

```
A0 ─── A1 ─┬─ A2 ─────────── (used by B, E, F, G for audit)
           ├─ A3 ─── B1 ─┬─ B2 ─┬─ B3
           │             ├─ B4 ─┼─ B5 ─── B6 ─── D1, D2, D3
           │             └──────┘
           ├─ A4 ──────────────── F1..F4
           └─ A5 ──── C1..C6  (parallel to B via mocks)

(A3 + B1 + B2) ────────── E1..E4
(A4 + F1 + B*) ────────── G1..G8
```

### 9.4 Suggested rollout (two engineers, ~4–5 months)

Two engineers, "Eng-A" mostly backend, "Eng-B" mostly frontend, with overlap.

| Phase | Weeks | Eng-A (backend-leaning) | Eng-B (frontend-leaning) | Outcome |
|---|---|---|---|---|
| 1 | 1–3 | A0, A1, A2, A4 | A5, mocked C1 | Infra; login; OpenAPI emitting; empty SPA shell |
| 2 | 3–6 | A3, B1, B2, B3 | C1, C2, mocked C3 | Workspaces + projects + iterations + versioned pages end-to-end |
| 3 | 6–10 | B4, B5, B6, D1–D3 | C3 (real), C4, C5 | Pages with custom blocks, samples (lineage), experiments, artifact viewers |
| 4 | 10–12 | F1, F2, F4, E1, E2 | C6, E3, E4 | Public PAT API live; `.ics` calendar feed; in-app calendar + Gantt |
| 5 | 12–15 | F3 (MCP), G1, G2, G5 | G6, G8 | MCP server; agentic chat live (read-only autonomy) |
| 6 | 15–18 | G3, G4 | G7 | Risk-assessment workflows shipped |
| 7 | 18–20 | Polish, FTS, observability, partition prep | Polish, accessibility, mobile-responsive | v1 launch-ready |

**Total**: ~18–20 weeks (4.5–5 months). Slack for unknowns: ~1 month already absorbed into Phase 7.

### 9.5 Definition of Done (per subtask)

- Package compiles with no internal dependencies reaching across module boundaries (enforced by a linter rule, e.g. `depguard` or `go-arch-lint`).
- Unit tests covering happy path + at least 3 error paths.
- HTTP contract tests against a `testdb` Postgres for every new endpoint.
- OpenAPI schema updated for any new endpoints.
- Audit entries written for every mutation (verified in test).
- Permissions enforced server-side (covered by tests, not just UI).
- README inside the package documenting its public interface and extension points.

---

## 10. Sample property freeform JSONB — known weakness (v1)

This is called out separately because it's the **biggest semi-controversial design decision** in v1.

**The decision**: `Sample.properties` is freeform JSONB. No canonical keys per `kind`. LLM workflows extract structured data (chemistry, mass, voltage windows, capacity) from page bodies and from whatever shape researchers happen to write into the JSONB blob.

**Why we're shipping it this way**:
- Faster adoption — no schema friction for the first batch of users.
- Researchers haven't yet revealed what fields they actually care about; locking a schema now is premature.
- v2 schema migration is straightforward once usage patterns are clear.

**What we accept as the cost**:
- LLM risk ratings depend on the LLM parsing "NMC811" / "LiNi0.8Mn0.1Co0.1O2" / "nickel-rich" out of prose consistently. It will sometimes fail.
- No structured filtering or reporting (e.g. "show me all samples with chemistry containing nickel and capacity < 150 mAh").
- Workflow outputs are less auditable — "why did the LLM give this a 4?" answer may be "it misread the chemistry."

**v2 commitment**: once we see real usage, define canonical typed keys per `kind` (e.g. for `cell`: `chemistry`, `mass_g`, `capacity_mah`, `nominal_voltage_v`, `cycling_protocol`). Migrate existing samples best-effort. Workflows then read structured fields first, prose second.

---

## 11. Non-Goals (v1)

- Mobile app (responsive web only).
- Real-time multi-user co-editing on the same page (single-editor with ETag conflict + presence indicator).
- Lab inventory / equipment booking.
- Auto-import from instruments.
- Two-way calendar sync.
- Google Calendar OAuth integration (`.ics` subscription instead).
- Apple CalDAV integration (`.ics` subscription instead).
- User-authored LLM workflows (v1 ships with curated library).
- Citation / reference manager.
- Org-wide / cross-workspace API tokens (v1 tokens are per-user only).
- **Outgoing webhooks** (deferred to v2).
- BYO OpenRouter key per workspace.
- Typed sample / experiment parameter schemas (freeform JSONB in v1).
- Notebook re-execution (rendered view only).
- Public read-only sharing.

---

## 12. Open Questions / Decisions for Later

1. **External-collaborator policy beyond v1** — current model: admin allow-lists individual emails. Do we want allow-listed domains too? (Probably yes by month 3.)
2. **Default LLM model per workspace** — Claude Sonnet vs GPT-4o vs an open model. Likely Sonnet for workflows, cheaper model for chat; PI to confirm.
3. **Default workspace spend cap.** Suggest $200/mo for the primary lab workspace, $20/mo for collaborator workspaces; PI to set.
4. **Backup upgrade trigger** — when do we migrate from nightly EBS snapshots to `pg_basebackup` + WAL archiving? Suggest: when uptime SLA matters or when data > 20 GB.
5. **Canonical sample-property schemas per kind** — v2 priority (see §10).
6. **Method-specific Experiment parameter schemas** — v2.
7. **MCP transport** — SSE in-binary in v1; separate sidecar in v2 if isolation needed.
8. **Two-way calendar sync** — v2; revisit after measuring whether `.ics` refresh lag actually bites.
9. **Notebook re-execution** — v2 (JupyterLite / Marimo embeds).
10. **Public read-only sharing** — v2.
11. **Webhook design when re-introduced** — HMAC signing, retry policy, delivery log; spec to be written when a concrete consumer appears.
12. **Audit log archive trigger** — at what row count or table size do we move to S3-archived old partitions? Suggest revisit at 50M rows.
13. **2FA** — TOTP for local accounts in v1.1; not in v1.
14. **LLM revision GC opt-in** — currently keep-forever; PI may want a GC policy once a few months of data exist.