# User Guide

How to use the Lab Project Management Platform. This reflects the features
available today; sections marked _(coming soon)_ are planned but not yet built.

## Getting in

1. Start the stack (see the [README](../README.md) quickstart): `make up`,
   `go run ./cmd/seed`, `go run ./cmd/api`, and `cd web && pnpm dev`.
2. Open <http://localhost:5173>.
3. Sign in with the seeded developer account:
   - **Email:** `dev@halide-lab.org`
   - **Password:** `devpassword`

University users will sign in via Microsoft SSO and external collaborators via an
emailed invite link; locally, SSO is backed by a mock provider and invite emails
land in **Mailpit** at <http://localhost:8025>.

## Workspaces and projects

- A **workspace** is your lab or collaboration group. Create one from the
  workspace switcher in the sidebar; you become its owner.
- A **project** lives inside a workspace and can be **workspace-visible** (any
  member can see it) or **private** (only invited collaborators). Create projects
  from the workspace view.
- **Roles**: workspace owner/admin/member; per-project owner/editor/viewer. Your
  effective permission on a project is the highest of your workspace role, any
  explicit project collaboration, and admin override. Editors and owners can
  change content; viewers are read-only.
- Add collaborators to a project by email (they must already have an account /
  have accepted an invite).

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
  (cycling, synthesis, SEM, XRD, EIS, weighing, drying, custom). The experiment
  detail page shows **method-specific parameter forms** (e.g. cycling rate / cycles
  / voltage window), a result summary, status, and a **sample picker** to link the
  samples involved (subject/reference/control/byproduct), plus an optional link to
  an iteration.
- **Pages** — block-editor documents (BlockNote) attached to a project, iteration,
  sample, or experiment. Create/open pages from a project's **Notes / Pages** tab.
  The editor auto-saves (after ~10s idle, on blur, or Ctrl/Cmd-S) and supports
  **lab reference blocks** — type `/` and insert a `@sample`/`@experiment`/
  `@artifact` reference that renders a live card linking to the entity. Every save
  is an immutable revision: open **History** to diff against any revision and
  restore one (non-destructively). Concurrent edits are guarded by optimistic
  locking — if the page changed under you, you get a conflict banner to reload or
  overwrite rather than silently clobbering — and a presence indicator shows who
  else is editing.
- **Artifacts** — files (PDF, Jupyter notebook, image, other) scoped to a project.
  Upload from the project's Artifacts tab: the file goes directly to object
  storage via a presigned URL and is then processed in the background — PDFs get a
  page count, notebooks are rendered to HTML, and images get thumbnails. View PDFs
  inline (PDF.js), images in a lightbox, and rendered notebooks in a sandboxed
  frame. Attach artifacts to samples or experiments with a typed role from those
  detail pages.

## Calendar

- Each project has **events** (deadlines, milestone ends, meetings, reminders,
  custom) with start/end times, all-day flag, and RFC 5545 recurrence rules.
- **Subscribe from your own calendar app**: open your calendar subscription in
  settings to get a personal signed URL of the form
  `/v1/cal/{your_id}/{token}.ics`. Paste it into Google Calendar ("Add by URL"),
  Apple Calendar ("Subscribe to Calendar…"), or Outlook ("Add calendar from
  internet"). It includes every event in the projects you can see.
- You can **rotate** the URL token at any time, which invalidates the old link.
- Note: external calendars refresh on their own schedule (Google ~12h, Apple
  5–60 min), so a brand-new event may not appear instantly. _The in-app calendar
  and Gantt timeline views are coming soon._

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
  wrap the same REST API with the same auth, scopes, and audit. _Write tools are
  reserved for the AI assistant track and are intentionally not exposed yet._

## Accounts & auth notes

- Sessions use a short-lived access token plus an httpOnly refresh cookie; the
  app refreshes silently. Local-account passwords are hashed with Argon2id.
- Admins/PIs can be granted override visibility into a workspace's content; every
  such access is recorded in the audit log.

## Not yet available

- AI assistant chat and AI-assisted risk-assessment workflows (Track G) are
  intentionally not built yet.
