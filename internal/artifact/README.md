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

## Track-D background processing pipeline

After `POST /v1/artifacts/{id}/complete`, `CompleteUpload` enqueues a River
job (`process_artifact`) and returns immediately. The `ProcessArtifactWorker`
(registered in the same process) picks up the job and:

1. Sets `processing_status = 'processing'`.
2. Downloads the original from `BucketOriginals` via `ObjectStore.Get`.
3. Dispatches by `type`:
   - **`pdf`** — Calls `pdfPageCount` (pure-Go pdfcpu) to extract page count.
     Stores `{page_count: N}` in `metadata`. Sets `processing_status='done'`.
     **No thumbnail is generated**: pure-Go PDF→image rasterization requires
     CGo/native binaries (e.g. MuPDF, Poppler). pdfcpu does not ship a
     rasterizer, so `thumbnail_url` is left empty for PDFs.
   - **`ipynb`** — POSTs the raw .ipynb JSON to the nbconvert sidecar
     (`cfg.NBConvertURL + /render`). The sidecar runs Jupyter nbconvert and
     returns HTML. The HTML is uploaded to `BucketRendered` as
     `{storage_key}.html` and `rendered_url` is set.
   - **`image`** — Uses `github.com/disintegration/imaging` (pure-Go, no CGo)
     to decode and resize the image to small (≤200px max edge) and medium
     (≤800px max edge) JPEG thumbnails. Both are uploaded to `BucketRendered`.
     `thumbnail_url` is set to the small thumbnail; `metadata.thumbnail_medium_url`
     holds the medium URL.
   - **`other`** — Sets `processing_status='done'` with no further action.
4. On success: sets `processing_status='done'` and the output URLs/metadata.
5. On failure: sets `processing_status='failed'` and records the error in
   `metadata.error`.

### govips → imaging substitution note

The README originally anticipated govips (a Go binding for libvips, very fast)
for image processing. libvips is not available in the current deployment
environment, so Track-D uses the pure-Go `github.com/disintegration/imaging`
library instead. For production scale, swap `renderThumbnails` for a govips
implementation — the `ObjectStore`/`Enqueuer` interfaces and worker structure
remain identical.

### `ObjectStore` interface

```go
type ObjectStore interface {
    Get(ctx context.Context, bucket, key string) ([]byte, error)
    Put(ctx context.Context, bucket, key string, body []byte, contentType string) error
}
```

The production implementation (`s3Store`) is built from the same AWS SDK v2
config the module uses for presigning. Tests inject an in-memory fake.
`NewS3Store(cfg)` constructs the production implementation.

### `Enqueuer` interface

```go
type Enqueuer interface {
    EnqueueProcessArtifact(ctx context.Context, id uuid.UUID) error
}
```

`NewRiverEnqueuer(client *river.Client[pgx.Tx])` builds the production
implementation. The `Service.enqueuer` field is nil by default (keeping existing
tests green); call `SetEnqueuer(e)` from `cmd/api/main.go` after the River
client is constructed.

## Auth

All endpoints require an authenticated principal (`platform.PrincipalFrom(ctx)`).
Project access is enforced via `project.Service.Authorize` using the artifact's
`project_id` as the resource anchor.
