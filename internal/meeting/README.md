# Meeting Module (H2)

Workspace- and project-scoped meetings: agenda, decisions, action items,
attendees, and notes.

## Domain struct

```go
type Meeting struct {
    ID          uuid.UUID
    WorkspaceID uuid.UUID
    ProjectID   *uuid.UUID      // optional project scope
    Title       string
    Kind        string          // sync|review|planning|retro|other
    Chair       *uuid.UUID
    StartAt     time.Time
    EndAt       *time.Time
    Location    string
    Agenda      string
    Notes       string
    Attendees   json.RawMessage // jsonb array
    Decisions   json.RawMessage // jsonb array
    ActionItems json.RawMessage // jsonb array of {text, owner, done}
    CreatedBy   uuid.UUID
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

## Service

```go
func NewService(pool *pgxpool.Pool, org *org.Service, projects *project.Service, rec audit.Recorder, log *slog.Logger) *Service
func Register(api huma.API, svc *Service)
```

## Authorization

Reads and writes require **workspace membership** (checked via `org.Service`).
The `attendees`/`decisions`/`action_items` columns are freeform JSONB arrays
replaced in full on PATCH.

## HTTP Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/v1/workspaces/{id}/meetings` | Create. |
| `GET` | `/v1/workspaces/{id}/meetings` | List, ordered by `start_at` (client splits upcoming/past). |
| `GET` | `/v1/meetings/{id}` | Get one. |
| `PATCH` | `/v1/meetings/{id}` | Partial update. |
| `DELETE` | `/v1/meetings/{id}` | Delete. |

## Migrations

- `00122_meetings.sql`: creates the `meetings` table + index on `(workspace_id, start_at)`.
