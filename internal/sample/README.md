# Sample Module (B4)

Physical and digital lab sample tracking scoped to projects, with lineage graph support.

## Domain struct

```go
type Sample struct {
    ID                uuid.UUID
    ProjectID         uuid.UUID
    Identifier        string          // unique within a project
    Name              string
    Description       string
    Kind              string          // precursor|electrode|cell|module|derivative|other
    Properties        json.RawMessage // freeform JSONB — replaced in full on PATCH
    Status            string          // active|consumed|archived|failed
    DescriptionPageID *uuid.UUID      // no FK; page module owns pages
    CreatedBy         uuid.UUID
    CreatedAt         time.Time
    UpdatedAt         time.Time
}
```

## Service

```go
func NewService(pool *pgxpool.Pool, projects *project.Service, rec audit.Recorder, log *slog.Logger) *Service
func (s *Service) GetSample(ctx context.Context, id uuid.UUID) (*Sample, error)
func Register(api huma.API, svc *Service)
```

`NewService` wires together the Postgres pool, the project authorization service, and the audit recorder.

`GetSample` loads a sample by UUID. Returns `platform.NotFound("sample.not_found", ...)` if absent. Exported for future cross-module use (experiment, artifact, etc.).

## Authorization

All endpoints require an authenticated `platform.Principal`. Authorization delegates to `project.Service.Authorize`:

- Read operations require `org.RoleViewer`.
- Write operations (create, patch, add relation) require `org.RoleEditor`.

For `/v1/samples/{id}` routes the sample is loaded first to obtain its `project_id`, then authorization is checked against that project.

## HTTP Endpoints

| Method | Path | Role | Notes |
|--------|------|------|-------|
| `POST` | `/v1/projects/{id}/samples` | Editor | Create sample. 409 on duplicate identifier. Audits `sample.create`. |
| `GET` | `/v1/projects/{id}/samples` | Viewer | List samples. Optional `?kind=` filter. |
| `GET` | `/v1/samples/{id}` | Viewer | Get single sample. |
| `PATCH` | `/v1/samples/{id}` | Editor | Partial update. Audits `sample.update`. |
| `POST` | `/v1/samples/{id}/relations` | Editor | Add lineage edge. Audits `sample.relation_add`. |
| `GET` | `/v1/samples/{id}/lineage` | Viewer | Lineage graph (nodes + edges). |

## Properties field

`properties` is a freeform JSONB document. On `PATCH` it is **replaced in full** — the new value becomes the stored document. Callers that need merge semantics must read-then-write. Deep merge is a v2 concern.

## Lineage traversal

`GET /v1/samples/{id}/lineage` returns `{ "nodes": [Sample...], "edges": [{parent_sample_id, child_sample_id, relation_type, notes}...] }`.

Traversal is a BFS that expands both ancestor and descendant edges from the focal sample. It is bounded to **25 hops** to prevent unbounded queries on large or cyclic graphs. Both samples in a relation must belong to the same project (enforced at the application level; returns 400 otherwise).

Supported relation types: `derived_from`, `split_from`, `assembled_into`, `tested_as`, `duplicate_of`.

## Migrations

- `00060_samples.sql`: creates `samples` and `sample_relations` tables.
