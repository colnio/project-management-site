# Experiment module (B5)

Implements lab experiment CRUD, sample linking, and project-scoped access control.

## Domain types

### `Experiment`

```go
type Experiment struct {
    ID            uuid.UUID
    ProjectID     uuid.UUID
    IterationID   *uuid.UUID      // bare UUID, no FK — iteration module owns iterations table
    Method        string          // enum: cycling|synthesis|SEM|XRD|EIS|weighing|drying|custom
    Parameters    json.RawMessage // JSONB; PATCH replaces the entire object
    ResultSummary string
    NotesPageID   *uuid.UUID      // bare UUID, no FK — page module owns pages table
    PerformedBy   *uuid.UUID
    PerformedAt   *time.Time
    Status        string          // enum: planned|in_progress|completed|failed
    CreatedBy     uuid.UUID
    CreatedAt     time.Time
    UpdatedAt     time.Time
}
```

### `ExperimentSample`

```go
type ExperimentSample struct {
    SampleID uuid.UUID
    Role     *string   // nullable enum: subject|reference|control|byproduct
    Note     string
}
```

## Service API

### `NewService`

```go
func NewService(
    pool     *pgxpool.Pool,
    projects *project.Service,
    rec      audit.Recorder,
    log      *slog.Logger,
) *Service
```

### `GetExperiment`

```go
func (s *Service) GetExperiment(ctx context.Context, id uuid.UUID) (*Experiment, error)
```

Returns `platform.NotFound` (`experiment.not_found`, 404) when the experiment does not exist.

### `Register`

```go
func Register(api huma.API, svc *Service)
```

Wires all endpoints onto the huma API. Called from `cmd/api/main.go`.

## HTTP endpoints

All endpoints require an authenticated `Principal`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/projects/{id}/experiments` | RoleEditor | Create experiment |
| GET | `/v1/projects/{id}/experiments` | RoleViewer | List experiments (filters: `iteration_id`, `method`, `sample_id`) |
| GET | `/v1/experiments/{id}` | RoleViewer | Get experiment |
| PATCH | `/v1/experiments/{id}` | RoleEditor | Update experiment; `parameters` replaces the entire JSONB |
| POST | `/v1/experiments/{id}/samples` | RoleEditor | Link (upsert) a sample |
| DELETE | `/v1/experiments/{id}/samples/{sid}` | RoleEditor | Unlink a sample |
| GET | `/v1/experiments/{id}/samples` | RoleViewer | List linked samples |

Authorization for `/experiments/{id}` routes: load experiment → `projects.Authorize(ctx, p, exp.ProjectID, need)`.

## Audit events

| Action | Trigger |
|--------|---------|
| `experiment.create` | POST create |
| `experiment.update` | PATCH update |
| `experiment.sample_link` | POST samples |
| `experiment.sample_unlink` | DELETE samples/{sid} |

## No-FK notes

- `iteration_id`: stored as a bare UUID column. The iteration module owns the `iterations` table. No foreign key constraint; referential integrity is maintained at the application level.
- `sample_id` in `experiment_samples`: stored as a bare UUID column. The sample module owns the `samples` table. No foreign key constraint.

## Migrations

- `00070_experiments.sql` — creates `experiments` table with indexes on `project_id` and `iteration_id`.
- `00071_experiment_samples.sql` — creates `experiment_samples` join table with indexes on `experiment_id` and `sample_id`.
