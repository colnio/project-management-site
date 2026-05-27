# User Guide

How to use the Lab Project Management Platform. This reflects the features
available today; sections marked _(coming soon)_ are planned but not yet built.

## Getting in

1. Start the stack (see the [README](../README.md) quickstart): `make up`,
   `go run ./cmd/seed`, `go run ./cmd/api`, and `cd web && pnpm dev`.
2. Open <http://localhost:5173>.
3. Sign in with the seeded developer account:
   - **Email:** `dev@graphene-lab.org`
   - **Password:** `devpassword`

**New accounts** self-register from the login page's **Create an account** link.
Registration requires an allowed email domain (`@nus.edu.sg` or `@u.nus.edu` by
default, configurable via `ALLOWED_EMAIL_DOMAINS`) and a password. A new account
is **pending** — it cannot log in until an **admin or PI approves** it (Admin →
Users). On first successful login the user must complete a short **profile**
(first/last name, title, bio) before reaching the app; it stays editable in
Settings. Accounts can also be **suspended** by an admin/PI. (Invite emails land in
**Mailpit** at <http://localhost:8025> locally.)

**Global roles:** `member` (default), `pi`, and `admin`. **Admins and PIs** (the
"privileged" tier) approve/suspend/reject users, change global roles, manage
workspace membership, and **create workspaces**. The PI role specifically governs
Risk-Assessment PI sign-off.

## Workspaces and projects

- A **workspace** is your lab or collaboration group. **Only admins/PIs can create
  workspaces** (the "+ New workspace" button is hidden for regular members); the
  creator becomes its owner.
- A **project** lives inside a workspace and can be **workspace-visible** (any
  member can see it) or **private** (only invited collaborators). **Any workspace
  member can create projects** from the workspace view.
- **Roles**: workspace owner/admin/member; per-project owner/editor/viewer. Your
  effective permission on a project is the highest of your workspace role, any
  explicit project collaboration, and admin override. Editors and owners can
  change content; viewers are read-only.
- Add collaborators to a project by email (they must already have an account /
  have accepted an invite). Use the **Share** button in the project header to add
  a collaborator by email + role (owner/editor/viewer), see who has access, and
  remove people. Adding/removing collaborators requires the **owner** role.
- The project header's **"..."** menu has: **Edit details** (name, description,
  visibility), **Archive project**, **Manage access** (same Share dialog), and
  **Copy link**.
- **⌘K command palette** — search across projects, workspaces, samples,
  experiments, and pages for the active project. Type any fragment of a name or
  title to jump directly to an entity.

## The research data model

- **Samples** — physical specimens (precursor, electrode, cell, module,
  derivative). Each has a lab identifier, a `kind`, a free-form properties record,
  and a status. The sample detail page has a key→value **property editor** for the
  free-form data and a **lineage graph** (interactive React Flow diagram): record
  relations like _derived_from_, _split_from_, _assembled_into_, _tested_as_,
  _duplicate_of_, and see the full ancestor/descendant graph.
- **Iterations** — ordered phases of a project (planned/active/done/blocked) with
  start/end dates. The iteration detail page lets you edit fields and link the
  samples an iteration touches (with role input/output/passthrough).
- **Experiments** — a structured record of what was actually done: a method
  (cycling, synthesis, SEM, XRD, EIS, weighing, drying, custom). Each gets a
  short human-readable code (`EX-1`, `EX-2`, … per project) shown instead of a
  raw UUID. The experiment detail page shows **method-specific parameter forms**
  (e.g. cycling rate / cycles / voltage window), a result summary, status, a
  **sample picker** to link the samples involved (subject/reference/control/
  byproduct), an optional iteration link, and renders attached artifacts as
  method-appropriate embeds (SEM micrographs, EIS fit PDFs + notebook cells,
  cycling overlays).
- **Pages** — block-editor documents (BlockNote) attached to a project, iteration,
  sample, or experiment. There are two entry points:
  - **Entity pages**: project and iteration detail views render three stacked
    sections — an editable **Description** document at the top, a **Dashboard**
    section (KPIs, Risk Register, linked samples/experiments; iterations also get
    Start/Stop status controls), and an editable **Notes** document below. The
    Description and Notes areas are independent BlockNote documents; the dashboard
    between them is live (not part of the document). Experiment and sample views
    keep a single editable Description document.
  - **Standalone pages**: create/open additional pages from the project's **Pages**
    tab or from the **Notes** dropdown in the sidebar (which lists all pages for
    that project). These open in the full-screen page editor.
  The editor auto-saves (after ~10s idle, on blur, or Ctrl/Cmd-S) and supports
  **lab reference blocks** — type `/` and choose from:
  - `@sample`/`@experiment`/`@artifact` — inserts a live card linking to the entity.
  - **Attachments** group — `Image embed`, `PDF embed`, `HTML embed` — uploads the
    file via the artifact handshake and renders it inline. HTML attachments display
    in a sandboxed frame (scripts allowed; no network/same-origin access).
  Every save is an immutable revision: open **History** to diff against any revision
  and restore one (non-destructively). Concurrent edits are guarded by optimistic
  locking — if the page changed under you, you get a conflict banner to reload or
  overwrite rather than silently clobbering — and a presence indicator shows who
  else is editing.
- **Artifacts** — files (PDF, Jupyter notebook, image, other) scoped to a project.
  Upload from the project's Artifacts tab: the file goes directly to object
  storage via a presigned URL and is then processed in the background — PDFs get a
  page count, notebooks are rendered to HTML, and images get thumbnails. The
  Artifacts tab is a **thumbnail gallery** — items show their generated thumbnail
  (or a type-specific placeholder) with a processing indicator until ready. View
  PDFs inline (PDF.js), images in a lightbox, and rendered notebooks in a sandboxed
  frame. Attach artifacts to samples or experiments with a typed role from those
  detail pages.

## Risk Register

Every project has a **Risk Register** — the lab's record of what could go wrong
and how it's mitigated. It appears at the top of the project **Overview** and on
the active **iteration** page.

- Each risk has a **likelihood** (HIGH / MED / LOW), an **impact** headline +
  description, a **mitigation**, an optional **Plan B**, and a status.
- Risks flagged **PI REVIEW** need a principal investigator's sign-off. While an
  iteration has an unresolved HIGH risk flagged for PI review, you **cannot move
  that iteration to _active_** — the platform blocks the transition until the flag
  is cleared (this is the PI sign-off gate).
- Risks are authored by hand or **drafted by AI**: run a risk-assessment workflow
  (see _AI assistant_) and the engine fills the register with AI-sourced rows
  (rating → likelihood, plus mitigations), tagged with the originating run.
- **Editing by hand**: use **+ Add risk** to create a risk, or the per-row pencil
  to edit and the ✕ to delete. The **PI-review flag** toggle is shown only to
  principal investigators (system-admin accounts); everyone else can still add,
  edit, and delete risks and see the PI REVIEW chip.
- **Review with AI**: opens the sidebar AI assistant in a guided, multi-phase
  risk-assessment dialogue (driven by the `risk_assesment_skill`). Unlike the
  one-click "Run risk assessment" workflow, this is interactive — answer the
  assistant's prompts to build the assessment.
- **Send for approval**: opens a dialog to pick stakeholders (workspace members
  and project collaborators), write a description, and **Generate review** (an AI
  summary of the risk register you can edit). Sending creates a tracked approval
  request, emails the stakeholders, and posts it to their workspace **Inbox**,
  where a recipient (or a project editor) can **Approve** or **Reject** it.

## Overview layouts & Tweaks

- The project **Overview** has three layouts — **Dashboard** (KPI tiles + recent
  samples/experiments), **Editorial** (narrative + lead-questions + register), and
  **Stream** (a chronological activity feed). Switch with the segmented control on
  the Overview, or from the Tweaks panel.
- Open the **Tweaks** panel (gear in the sidebar foot) to change the Overview
  layout, toggle **dark mode**, pick an **accent color**, set **density**
  (compact / regular / comfy), toggle the AI panel, set the AI **autonomy** mode,
  and jump to a project tab. Choices persist across reloads.

## Workspace surfaces

The sidebar exposes workspace-level pages for the currently selected workspace:

- **Inbox** — a single feed of things needing attention (PI-flag reviews, proposed
  AI writes, audit/system events), grouped Today / Earlier / Older and filterable
  by kind; each item deep-links to its source.
- **People** — the member directory grouped by Owners / Admins / Members /
  External, with avatars, roles, and join dates.
- **Meetings** — workspace/project meetings split into upcoming and past; open one
  for its agenda, decisions, action-items, attendees, and editable notes. Create a
  meeting with the **New meeting** button.
- **Admin** — workspace settings, an AI usage overview (spend today/month vs the
  monthly cap), the members table, the risk-workflow library, and the audit log.
- **Templates** — the risk-assessment workflow library; each opens a definition
  page showing the step accordion (with prompt text) and the output schema.

## Creating projects & iterations

- **New project** (from the Workspaces view) is a wizard: Basics → an optional **AI
  risk-assessment** step that drafts the register → Team → an optional first
  iteration.
- **New iteration** (from a project's Iterations tab) is a wizard: Basics →
  Cycling protocol → Samples picker → an optional **AI-drafted iteration risk
  register**. If the draft raises a HIGH risk flagged for PI review, activating the
  iteration is blocked until a PI signs off.
- Both AI steps degrade gracefully if the assistant isn't configured — you can
  always skip and finish.

## Calendar

- Each project has **events** (deadlines, milestone ends, meetings, reminders,
  custom) with start/end times, all-day flag, and RFC 5545 recurrence rules.
- Open **Calendar** from the sidebar for an in-app month/week/agenda view. Switch
  scope between a single project and all your visible projects; click a date to
  create an event and click an event to edit or delete it. A **Timeline** toggle
  shows a Gantt view — iterations as bars on a date axis with event markers, with
  a **TODAY** marker line — both per project (the project's Timeline tab) and
  aggregated across projects.
- **Subscribe from your own calendar app**: the subscription panel is on the
  Calendar page (and in Settings) — get a personal signed URL of the form
  `/v1/cal/{your_id}/{token}.ics`. Paste it into Google Calendar ("Add by URL"),
  Apple Calendar ("Subscribe to Calendar…"), or Outlook ("Add calendar from
  internet"). It includes every event in the projects you can see.
- You can **rotate** the URL token at any time, which invalidates the old link.
- Note: external calendars refresh on their own schedule (Google ~12h, Apple
  5–60 min), so a brand-new event may not appear instantly — use the in-app
  Calendar view for immediate feedback.

## For developers and agents (API access)

- Every action in the UI is available through the REST API. The OpenAPI 3.1 spec
  is at <http://localhost:8080/openapi.json> with interactive docs at `/docs`.
- **Personal Access Tokens**: manage these on the **Settings** page (gear icon in
  the sidebar) — create a named, scoped token (the secret, prefixed `pat_`, is
  shown once), see last-used, and revoke. Send it as `Authorization: Bearer pat_...`.
  Tokens are scoped (e.g. `read:projects`, `write:samples`) and never grant more
  than you have.
- Writes accept an `Idempotency-Key` header (24h replay window). Resources that
  support optimistic concurrency emit an `ETag`; send it back in `If-Match`.
- **Agent discovery**: `GET /llms.txt` lists every endpoint (generated from the
  live spec) plus auth instructions.
- **MCP**: an MCP server is mounted at `http://localhost:8080/mcp` (SSE). Point an
  MCP client at it with `Authorization: Bearer pat_...`; it exposes read-only
  tools (list/read projects, samples, lineage, experiments, pages, artifacts) that
  wrap the same REST API with the same auth, scopes, and audit. (Write tools are
  reserved for the in-app AI assistant, gated by autonomy config.)

## AI assistant

The platform includes an AI assistant (configured via `aiconf.local.json` — an
OpenAI-compatible endpoint; if it's not configured the AI features show "not
configured" and everything else still works).

- **Chat** — open **Ask AI** from a project to dock a Cursor-style assistant panel
  on the right, scoped to that project. Replies **stream** in live. The assistant
  is automatically aware of the current project (name, ID) and workspace — you do
  not need to specify which project you mean. It can answer questions like "what
  samples are in this project?" or "list all projects in this workspace" without
  any extra context. Read tools (search the project, read samples/experiments/
  pages/artifacts, trace lineage, list projects) are always active; the assistant
  shows what it used as numbered **citations**. A status strip shows the current
  **autonomy mode** and a **spend meter** (model + today's spend against the
  workspace monthly cap). Whether it can make *changes* (draft a page, set an
  iteration status, create a reminder, flag for review) depends on the project's
  **autonomy mode** — in `suggest_writes` it proposes a change and you **approve
  or reject** it inline.
- **Risk-assessment workflows** — the **AI Workflows** tab runs a guided
  assessment (`battery_safety_risk_v1`, `experimental_risk_v1`, `project_risk_v1`)
  against a project/sample/experiment. The result shows an overall rating,
  per-category ratings, and mitigations, and is saved as a page on the entity. If
  the rating is high (≥4) or the AI flags it, the **PI is emailed** for review.
- **Autonomy & cost** — set the AI's autonomy `mode`
  (`read_only` / `suggest_writes` / `auto_routine` / `full`) and allowed write
  tools per workspace (Settings) and per project (a project can't exceed its
  workspace). Every AI request is metered against a monthly spend cap (it refuses
  at the cap and warns at 80%), and the assistant acts as *you* — all its API
  calls are permission-checked and audited under your identity.

## Accounts & auth notes

- Sessions use a short-lived access token plus an httpOnly refresh cookie; the
  app refreshes silently. Local-account passwords are hashed with Argon2id.
- Admins/PIs can be granted override visibility into a workspace's content; every
  such access is recorded in the audit log.
