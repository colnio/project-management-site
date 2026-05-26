# calendar

Package `calendar` implements the Calendar module (E1+E2): project event CRUD, per-user iCalendar feed subscriptions, and RFC 5545-compliant `.ics` output.

## Domain types

### `Event`

Represents a calendar event attached to a project. Fields:

- `ID`, `ProjectID` — primary key and owning project (uuid)
- `IterationID`, `SampleID`, `ExperimentID` — optional bare-UUID links to other modules (no FK)
- `Kind` — one of `deadline`, `milestone_end`, `meeting`, `reminder`, `custom`
- `Title`, `Description` — display text
- `StartAt` — RFC 3339 timestamp (required)
- `EndAt` — optional end timestamp
- `AllDay` — when true, timestamps are treated as dates in ICS output
- `RecurrenceRule` — RFC 5545 RRULE string, e.g. `FREQ=WEEKLY;BYDAY=MO`
- `CreatedBy`, `CreatedAt`, `UpdatedAt`

### `Subscription`

Per-user iCalendar feed subscription. Fields:

- `ID`, `UserID` — primary key and owning user (uuid)
- `Token` — 32-byte base64url random string; used in the feed URL
- `Scope` — `all_visible_projects` or `per_project`
- `ProjectIDs` — relevant only when `scope=per_project`
- `RevokedAt` — if set, the feed returns 404
- `LastFetchedAt` — updated on each feed request (best-effort)
- `CreatedAt`

## Service

### `NewService`

```go
func NewService(pool *pgxpool.Pool, projects *project.Service, rec audit.Recorder, log *slog.Logger) *Service
```

Constructs the calendar `Service`. Requires a pgx pool, the project service (for `Authorize`), an audit recorder, and a structured logger.

### `GetEvent`

```go
func (s *Service) GetEvent(ctx context.Context, id uuid.UUID) (*Event, error)
```

Loads a project event by ID. Returns `platform.NotFound` (HTTP 404) if absent.

### `Register`

```go
func Register(api huma.API, svc *Service)
```

Wires all JSON endpoints onto the huma API:

**E1 — Events (require `Principal` in context):**

| Method | Path | Auth | Action |
|--------|------|------|--------|
| `POST` | `/v1/projects/{id}/events` | RoleEditor | Create event; audits `event.create` |
| `GET` | `/v1/projects/{id}/events` | RoleViewer | List events; supports `?from=` / `?to=` (RFC 3339) |
| `GET` | `/v1/events/{id}` | RoleViewer | Get a single event |
| `PATCH` | `/v1/events/{id}` | RoleEditor | Partial update; audits `event.update` |
| `DELETE` | `/v1/events/{id}` | RoleEditor | Delete event; audits `event.delete` |

**E2 — Subscription (require `Principal`):**

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/v1/cal/me/subscription` | Lazily create and return subscription + `ics_url` |
| `POST` | `/v1/cal/me/subscription/rotate` | Rotate token (invalidates old URL); audits `calendar.rotate` |
| `PATCH` | `/v1/cal/me/subscription` | Update `scope` and/or `project_ids` |

The `ics_url` in the response is `/v1/cal/{user_id}/{token}.ics`.

### `ICSHandler`

```go
func (s *Service) ICSHandler(w http.ResponseWriter, r *http.Request)
```

Serves the RFC 5545 iCalendar feed. **The orchestrator** mounts this handler at:

```
/v1/cal/{user_id}/{token}
```

using a chi route. Because the real URL ends in `.ics`, the captured `{token}` param will include a `.ics` suffix; `ICSHandler` strips it automatically.

**Access control:**

1. Parses `user_id` (uuid) and `token` from `chi.URLParam`.
2. Looks up the subscription by `user_id`. If missing, revoked, or token mismatches → `404`.
3. Builds a synthetic `&platform.Principal{UserID: user_id}` (first-party session — no scope restrictions).
4. Collects distinct `project_id`s from `project_events` (filtered to `project_ids` when `scope=per_project`).
5. For each project ID, calls `projects.Authorize(ctx, synthetic, pid, org.RoleViewer)`. Only projects where this succeeds are included.
6. Queries all events from accessible projects and emits a VCALENDAR body.
7. Updates `last_fetched_at` asynchronously (best-effort).

**RFC 5545 output format:**

```
BEGIN:VCALENDAR\r\n
VERSION:2.0\r\n
PRODID:-//Graphene Lab//PM//EN\r\n
CALSCALE:GREGORIAN\r\n
BEGIN:VEVENT\r\n
UID:<event_id>@graphene-lab\r\n
DTSTAMP:<now UTC in 20060102T150405Z>\r\n
DTSTART:<start UTC in 20060102T150405Z>\r\n
[DTEND:<end UTC>]\r\n
SUMMARY:<title escaped>\r\n
[DESCRIPTION:<desc escaped>]\r\n
[RRULE:<recurrence_rule>]\r\n
END:VEVENT\r\n
...
END:VCALENDAR\r\n
```

For `all_day=true` events, `DTSTART`/`DTEND` use `VALUE=DATE` format (`20060102`).  
Text values (SUMMARY, DESCRIPTION) escape `\`, `;`, `,`, and newlines per RFC 5545 §3.3.11.  
All line endings are CRLF (`\r\n`).

## Migration

One migration file is used:

- `00100_calendar_events.sql` — creates `project_events` and `calendar_subscriptions` tables with appropriate indexes.

## Orchestrator mount point

The orchestrator should mount the ICS handler on chi like:

```go
r.Get("/v1/cal/{user_id}/{token}", calSvc.ICSHandler)
```

The `.ics` suffix in the real URL is captured into the `{token}` parameter and stripped inside the handler.
