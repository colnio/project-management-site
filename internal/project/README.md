# Project module (B1)

Foundation module for all research-data modules (B2–B6). Every downstream module uses `GetProject` and `Authorize` to validate access before acting.

## Domain struct

```go
type Project struct {
    ID             uuid.UUID
    WorkspaceID    uuid.UUID
    Name           string
    Description    string
    Visibility     string     // "workspace" | "private"
    SummaryPageID  *uuid.UUID // no FK — page module owns pages
    CreatedBy      uuid.UUID
    ArchivedAt     *time.Time
    CreatedAt      time.Time
    UpdatedAt      time.Time
}
```

`SummaryPageID` carries no database FK because the pages table is owned by module B3. Application-level integrity is maintained by the page module.

## Construction

```go
func NewService(
    pool    *pgxpool.Pool,
    orgSvc  *org.Service,
    users   UserLookup,      // narrow interface: GetUserByEmail
    rec     audit.Recorder,
    log     *slog.Logger,
) *Service
```

## Downstream contract (exact signatures)

### GetProject

```go
func (s *Service) GetProject(ctx context.Context, id uuid.UUID) (*Project, error)
```

Loads a project by ID. Returns `platform.NotFound("project.not_found", …)` when absent. Archived projects are returned normally — callers decide how to handle them.

### Authorize

```go
func (s *Service) Authorize(
    ctx       context.Context,
    p         *platform.Principal,
    projectID uuid.UUID,
    need      org.Role,
) (*Project, org.Role, error)
```

1. Calls `GetProject` (propagates NotFound on miss).
2. Resolves the principal's effective role via `org.ResolveAccessForPrincipal` (handles system-admin bumps and collaborator entries).
3. Checks whether the resolved role satisfies `need`:
   - `RoleViewer` → `role.CanRead()`
   - `RoleEditor` → `role.CanWrite()`
   - `RoleOwner` → `role.CanManage()`
4. Returns `platform.Forbidden` if insufficient, otherwise returns the loaded `*Project` and the resolved `org.Role`.

Downstream usage pattern:

```go
proj, role, err := projectSvc.Authorize(ctx, p, projectID, org.RoleEditor)
if err != nil { return nil, err }
// proj.WorkspaceID and proj.Visibility are available for further queries
```

## HTTP endpoints

All endpoints require an authenticated principal.

| Method | Path | Minimum role | Description |
|--------|------|-------------|-------------|
| POST | `/v1/workspaces/{id}/projects` | workspace member | Create project |
| GET | `/v1/workspaces/{id}/projects` | workspace member | List readable projects |
| GET | `/v1/projects/{id}` | RoleViewer | Get project |
| PATCH | `/v1/projects/{id}` | RoleEditor | Partial update |
| POST | `/v1/projects/{id}/archive` | RoleOwner | Archive |
| GET | `/v1/projects/{id}/collaborators` | RoleViewer | List collaborators |
| POST | `/v1/projects/{id}/collaborators` | RoleOwner | Add collaborator by email |
| DELETE | `/v1/projects/{id}/collaborators/{user_id}` | RoleOwner | Remove collaborator |

Private projects created via POST are immediately accessible to the creator because `CreateProject` calls `org.AddCollaborator(projectID, creatorID, RoleOwner)`.

## Wiring

```go
// In your router setup (not in main.go which is frozen):
project.Register(api, projectSvc)
```
