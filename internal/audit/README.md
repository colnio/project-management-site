# audit

Package `audit` provides the immutable audit trail for the lab project-management platform. Every mutation, AI tool call, and admin override is recorded here.

---

## Core contracts

### `Entry`

```go
type Entry struct {
    Actor                uuid.UUID
    ViaTokenID           *uuid.UUID
    ViaAIConversationID  *uuid.UUID
    Action               string  // e.g. "sample.create"
    ResourceType         string  // e.g. "sample"
    ResourceID           string  // string to support non-UUID IDs
    RequestPayloadDigest string  // SHA-256 hex of request body
    ResponseStatus       int
    CreatedAt            time.Time // zero → DB DEFAULT now()
}
```

### `Recorder` interface

```go
type Recorder interface {
    Record(ctx context.Context, e Entry) error
}
```

`Nop` is a no-op implementation for tests and bootstrap paths.

---

## `NewRecorder`

```go
func NewRecorder(pool *pgxpool.Pool, log *slog.Logger) *PgRecorder
```

Creates a Postgres-backed recorder. The recorder is safe for concurrent use. If an INSERT fails, the error is logged at `ERROR` level and returned — callers decide whether to propagate or ignore (audit is best-effort durable, not a 2PC participant).

---

## `NewService` and `Register`

```go
func NewService(rec *PgRecorder) *Service
func Register(api huma.API, svc *Service)
```

`NewService` wraps a `PgRecorder` as an HTTP-facing service. `Register` wires the `GET /v1/audit` endpoint onto a `huma.API` instance. Call these from the orchestrator (`cmd/api/main.go`).

---

## `GET /v1/audit`

**OperationID:** `list-audit`

### Query parameters

| Parameter       | Type   | Description                                      |
|----------------|--------|--------------------------------------------------|
| `actor`         | UUID   | Filter by actor (optional)                       |
| `resource_type` | string | Filter by resource type (optional)               |
| `resource_id`   | string | Filter by resource ID (optional)                 |
| `limit`         | int    | Max entries (default 50, max 200)                |
| `cursor`        | string | Opaque pagination cursor from a previous response|

### Response

```json
{
  "items": [
    {
      "actor": "...",
      "action": "sample.create",
      "resource_type": "sample",
      "resource_id": "s-001",
      "response_status": 201,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "next_cursor": "<opaque>"
}
```

Entries are returned newest-first. When `next_cursor` is present, pass it as `?cursor=` to fetch the next page (keyset pagination on `created_at DESC, id DESC`).

### Access control

- Requires an authenticated `platform.Principal` — `401` otherwise.
- Requires `principal.IsSystemAdmin == true` — `403` otherwise.
- For token-scoped callers (`ViaTokenID` or `ViaAIConversationID` set), the token must carry scope `read:audit` — `403` otherwise. Interactive browser sessions (no token) are unrestricted.

---

## Partitioning upgrade path

The `audit_log` table ships as a plain heap table. When row count approaches ~50 million, convert to monthly `RANGE` partitioning on `created_at`:

1. Create partition tables: `CREATE TABLE audit_log_YYYY_MM PARTITION OF audit_log FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');`
2. Detach and re-attach the existing heap as the default partition, or migrate rows.
3. The schema is intentionally compatible with this conversion (UUID PK with no sequence dependency, `timestamptz` partition key).

For v1, the table ships unpartitioned to keep operational complexity low.
