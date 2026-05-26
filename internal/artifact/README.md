# Artifact module (B6)

Manages file uploads (PDFs, Jupyter notebooks, images, etc.) associated with
projects, samples, and experiments. Uses a presigned-upload handshake so
clients PUT directly to S3/MinIO without proxying through the API server.

## Domain struct: `Artifact`

```go
type Artifact struct {
    ID               uuid.UUID
    ProjectID        uuid.UUID
    Type             string          // pdf | ipynb | image | other
    Filename         string
    ContentType      string
    SizeBytes        int64
    StorageKey       string          // projects/{pid}/artifacts/{aid}/{filename}
    OriginalURL      string          // set by CompleteUpload
    RenderedURL      string          // set by Track-D worker
    ThumbnailURL     string          // set by Track-D worker
    Metadata         json.RawMessage
    ProcessingStatus string          // pending | processing | done | failed
    UploadedBy       uuid.UUID
    UploadedAt       time.Time
}
```

`Type` is inferred from `ContentType` and filename extension if not supplied
by the caller.

## `NewService`

```go
func NewService(
    pool     *pgxpool.Pool,
    projects *project.Service,
    cfg      *config.Config,
    rec      audit.Recorder,
    log      *slog.Logger,
) (*Service, error)
```

Builds an AWS SDK v2 presign client pointed at `cfg.S3Endpoint` (MinIO in
development, S3 in production). Uses static credentials from
`cfg.S3AccessKey`/`cfg.S3SecretKey`. Returns an error only if the credentials
are empty; unreachable MinIO is not an error because presigning is pure HMAC
and requires no network.

## `GetArtifact`

```go
func (s *Service) GetArtifact(ctx context.Context, id uuid.UUID) (*Artifact, error)
```

Loads an artifact by primary key. Returns `platform.NotFound` if absent.

## Presigned-upload handshake

1. **`POST /v1/projects/{id}/artifacts`** (RoleEditor)  
   Client sends `{filename, content_type, size_bytes, type?}`.  
   Server creates the artifact row (`processing_status='pending'`) and returns:
   ```json
   {
     "artifact": {...},
     "upload_url": "https://...",
     "method": "PUT",
     "headers": {"Content-Type": "application/pdf"}
   }
   ```

2. **Client PUTs the file** directly to `upload_url` with the specified headers.

3. **`POST /v1/artifacts/{id}/complete`** (RoleEditor)  
   Server sets `original_url = {S3PublicURLBase}/{bucket}/{storage_key}`.  
   `processing_status` remains `'pending'` — a Track-D background worker
   reads that queue and generates rendered/thumbnail variants, then sets
   `processing_status='done'`.

## Typed attachment joins

Artifacts are linked to samples and experiments via separate join tables with
a typed `role` column:

- **`sample_artifacts`** roles: `specimen_image`, `datasheet`, `reference`, `other`
- **`experiment_artifacts`** roles: `raw_data`, `analysis`, `report`, `calibration`, `photo`, `other`

### Endpoints

| Method | Path | Role |
|--------|------|------|
| `POST /v1/samples/{sid}/artifacts` | Attach artifact to sample | Editor on artifact's project |
| `GET  /v1/samples/{sid}/artifacts` | List sample's artifacts | Principal (403s swallowed) |
| `POST /v1/experiments/{eid}/artifacts` | Attach artifact to experiment | Editor on artifact's project |
| `GET  /v1/experiments/{eid}/artifacts` | List experiment's artifacts | Principal (403s swallowed) |

`GET` list endpoints swallow 403s so a caller receives only the artifacts their
role permits, without the request failing.

## Track-D processing handoff

After `POST /v1/artifacts/{id}/complete`, `processing_status` is left as
`'pending'`. A Track-D worker (not part of this module) polls or subscribes for
artifacts in that state, runs nbconvert / image processing, uploads rendered
outputs to `BucketRendered`, and sets `processing_status='done'` along with
`rendered_url` and `thumbnail_url`.

## Auth

All endpoints require an authenticated principal (`platform.PrincipalFrom(ctx)`).
Project access is enforced via `project.Service.Authorize` using the artifact's
`project_id` as the resource anchor.
