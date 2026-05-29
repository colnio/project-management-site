# Org module (A3)

Workspaces, memberships, project collaborations, admin overrides, and workspace invites.

---

## Role type

```go
type Role string

const (
    RoleNone   Role = "none"
    RoleViewer Role = "viewer"
    RoleEditor Role = "editor"
    RoleOwner  Role = "owner"
)

func (r Role) CanRead() bool   // viewer+
func (r Role) CanWrite() bool  // editor+
func (r Role) CanManage() bool // owner only
```

Roles rank: none(0) < viewer(1) < editor(2) < owner(3).

---

## ResolveAccess / ResolveAccessForPrincipal

These are the primary APIs downstream modules call to gate access to projects.

```go
func (s *Service) ResolveAccess(
    ctx context.Context,
    userID, workspaceID uuid.UUID,
    projectVisibility string,  // "workspace" or "private"
    projectID *uuid.UUID,      // nil for a workspace-level question
) (Role, error)
```

**Effective role = max(adminOverride→viewer, workspaceMembershipRole, collaboratorRole)**

Workspace membership → project role mapping (applies only when `projectVisibility == "workspace"`):

| Workspace role | Effective project role |
|---------------|----------------------|
| `owner`       | `owner`              |
| `admin`       | `editor`             |
| `member`      | `editor`             |

Private projects ignore workspace membership; only the `project_collaborations` row and `admin_overrides` contribute.

When `projectID` is nil (workspace-level question), workspace membership maps as: owner→owner, admin→editor, member→viewer.

```go
func (s *Service) ResolveAccessForPrincipal(
    ctx context.Context,
    p *platform.Principal,
    workspaceID uuid.UUID,
    projectVisibility string,
    projectID *uuid.UUID,
) (Role, error)
```

Convenience wrapper: if `p.IsSystemAdmin` is true and the resolved role is below viewer, bumps to `RoleViewer` and records an `admin.override_access` audit entry.

---

## Collaborator Go API

These methods are called by the project module (B1) — no HTTP endpoints are exposed for collaborators from this module.

```go
func (s *Service) AddCollaborator(ctx context.Context, projectID, userID uuid.UUID, role Role) error
func (s *Service) RemoveCollaborator(ctx context.Context, projectID, userID uuid.UUID) error
func (s *Service) ListCollaborators(ctx context.Context, projectID uuid.UUID) ([]Collaborator, error)
func (s *Service) CollaboratorRole(ctx context.Context, projectID, userID uuid.UUID) (Role, bool, error)
```

Valid collaborator roles: `owner`, `editor`, `viewer`.

### project_collaborations — no FK on project_id

The `project_collaborations` table does NOT have a foreign key on `project_id`. The `projects` table is owned by module B1, which may not exist at migration time. Module B1 is responsible for deleting collaboration rows when a project is deleted.

---

## Other Go APIs

```go
func (s *Service) WorkspaceRole(ctx context.Context, workspaceID, userID uuid.UUID) (string, bool, error)
func (s *Service) GetWorkspace(ctx context.Context, id uuid.UUID) (*Workspace, error)
```

---

## Users interface

```go
type Users interface {
    GetUserByEmail(ctx context.Context, email string) (*auth.User, error)
    GetUserByID(ctx context.Context, id uuid.UUID) (*auth.User, error)
    CreateUser(ctx context.Context, email, displayName string) (*auth.User, error)
    SetPassword(ctx context.Context, userID uuid.UUID, password string) error
}
```

`*auth.Service` satisfies this interface directly. Tests may supply a fake.

---

## HTTP endpoints

All endpoints require authentication via `platform.PrincipalFrom(ctx)` unless noted.

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| `POST` | `/v1/workspaces` | Yes | Create workspace; caller becomes owner |
| `GET` | `/v1/workspaces` | Yes | List workspaces caller is a member of |
| `GET` | `/v1/workspaces/{id}` | Yes (member or sysadmin) | Get a workspace |
| `GET` | `/v1/workspaces/{id}/members` | Yes (member) | List workspace members |
| `POST` | `/v1/workspaces/{id}/members` | Yes (owner/admin) | Add or update member by email |
| `DELETE` | `/v1/workspaces/{id}/members/{user_id}` | Yes (owner/admin) | Remove member; cannot remove last owner |
| `POST` | `/v1/workspaces/{id}/invites` | Yes (owner/admin) | Create invite and send email |
| `POST` | `/v1/invites/accept` | No | Accept invite token; creates user if needed |

### Invite flow

1. Owner/admin POSTs to `/v1/workspaces/{id}/invites` with `{email, role}`.
2. A 7-day invite is created; `sha256(raw_token)` stored; `notify` enqueues a `workspace_invite` email (Mailpit locally). If enqueue fails, a warning is logged but the 201 is still returned.
3. Recipient POSTs to `/v1/invites/accept` with `{token, password, display_name}`.
   - If user exists → membership added.
   - If user absent → `CreateUser` + `SetPassword`, then membership added.
   - Invite marked accepted. Returns `{user_id, workspace_id}`.

---

## Constructor

```go
func NewService(
    pool  *pgxpool.Pool,
    cfg   *config.Config,
    rec   audit.Recorder,
    users Users,
    log   *slog.Logger,
) *Service

func Register(api huma.API, svc *Service)
```
