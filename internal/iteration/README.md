# Iteration Module (B2)

The iteration module provides sprint/cycle planning units scoped to projects.
It depends on the **project** module for authorization and does not import any
other Track-B sibling (sample, experiment, page, artifact) — all cross-module
references are bare UUIDs.

## Domain struct

```go
type Iteration struct {
    ID            uuid.UUID  `json:"id"`
    ProjectID     uuid.UUID  `json:"project_id"`
    Title         string     `json:"title"`
    Description   string     `json:"description"`
    Status        string     `json:"status"`      // planned|active|done|blocked
    Position      int        `json:"position"`
    StartAt       *time.Time `json:"start_at,omitempty"`
    EndAt         *time.Time `json:"end_at,omitempty"`
    SummaryPageID *uuid.UUID `json:"summary_page_id,omitempty"`
    CreatedBy     uuid.UUID  `json:"created_by"`
    CreatedAt     time.Time  `json:"created_at"`
    UpdatedAt     time.Time  `json:"updated_at"`
}
```

`SummaryPageID` has no database foreign key — the page module owns the pages
table; integrity is maintained at the application level.

## Service

### Constructor

```go
func NewService(
    pool     *pgxpool.Pool,
    projects *project.Service,
    rec      audit.Recorder,
    log      *slog.Logger,
) *Service
```

### GetIteration

```go
func (s *Service) GetIteration(ctx context.Context, id uuid.UUID) (*Iteration, error)
```

Loads an iteration by primary key. Returns `platform.NotFound("iteration.not_found", ...)` if absent.

## HTTP endpoints

All endpoints require an authenticated `platform.Principal` on the context.
Authorization is delegated to `project.Service.Authorize`.

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/v1/projects/{id}/iterations` | Editor | Create iteration; `position` = max+1 |
| GET | `/v1/projects/{id}/iterations` | Viewer | List ordered by `position ASC` |
| GET | `/v1/iterations/{id}` | Viewer | Get single iteration |
| PATCH | `/v1/iterations/{id}` | Editor | Partial update; sets `updated_at=now()` |
| DELETE | `/v1/iterations/{id}` | Editor | Delete iteration |
| POST | `/v1/iterations/{id}/samples` | Editor | Upsert sample link |
| DELETE | `/v1/iterations/{id}/samples/{sid}` | Editor | Remove sample link |
| GET | `/v1/iterations/{id}/samples` | Viewer | List linked samples |

### Register

```go
func Register(api huma.API, svc *Service)
```

Wires all endpoints onto the huma API instance.

## iteration_samples: no FK on sample_id

`iteration_samples.sample_id` is a bare `uuid` with **no foreign key** to any
samples table. The sample module (B4) owns the samples table; referential
integrity is enforced at the application level. This keeps the iteration module
independent of sibling Track-B packages and safe for parallel development.

## Audit actions

| Action | Trigger |
|--------|---------|
| `iteration.create` | Iteration created |
| `iteration.update` | Iteration patched |
| `iteration.delete` | Iteration deleted |
| `iteration.sample_link` | Sample linked (or upserted) |
| `iteration.sample_unlink` | Sample unlinked |

## Migrations

| File | Content |
|------|---------|
| `00050_iterations.sql` | `iterations` table + project_id index |
| `00051_iteration_samples.sql` | `iteration_samples` table + iteration_id index |
