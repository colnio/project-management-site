# Page Module (B3)

Content-addressable block pages with an immutable revision graph.

## Content-Addressable Model

```
Page
 └─ current_revision_id ──► PageRevision (status=current)
                                └─ blob_hash ──► PageBlob (blocks jsonb, sha256 hash)
```

Every write upserts into `page_blobs` (keyed by sha256 hex of canonical JSON) then inserts an immutable `page_revisions` row. Duplicate block content reuses the same blob — no data is copied.

## Service API

```go
func NewService(pool *pgxpool.Pool, projects *project.Service, rec audit.Recorder, log *slog.Logger) *Service

func (s *Service) GetPage(ctx context.Context, id uuid.UUID) (*Page, error)

func (s *Service) GCAutoSaves(ctx context.Context) (deleted int, err error)
```

All HTTP endpoints authorize via `projects.Authorize(ctx, principal, page.ProjectID, need)` — no sibling module imports are required beyond `project`.

## ETag / If-Match Flow (412)

1. `GET /v1/pages/{id}` returns `ETag: "<current_revision_id>"`.
2. Client sends `PUT /v1/pages/{id}` with `If-Match: "<etag>"`.
3. Server compares via `platform.ETagMatches(ifMatch, currentRevID)`.
4. Mismatch → `platform.PreconditionFailed(currentState)` → HTTP 412.
5. Client must reload and retry.

## Candidate / Approve / Reject

A `candidate` revision is inserted with `status='candidate'` and does NOT advance `pages.current_revision_id`. Use `PUT /v1/pages/{id}?candidate=true` or `"candidate": true` in the PUT body to create one.

- `POST /v1/pages/{id}/candidates/{cand_id}/approve` — promotes the candidate to `current`; prior current → `superseded`. Audit: `page.candidate_approve`.
- `POST /v1/pages/{id}/candidates/{cand_id}/reject` — marks the candidate `rejected` (kept for audit). Audit: `page.candidate_reject`.

## Restore

`POST /v1/pages/{id}/restore` with `{"revision_id": "<uuid>"}` creates a NEW revision (source=`restore`, `restore_of`=<uuid>) reusing the target revision's blob. The old current → `superseded`. All prior revisions remain intact (non-destructive). Audit: `page.restore`.

## Presence (Polling)

- `POST /v1/pages/{id}/presence/heartbeat` — upserts `page_presence` (sets `last_heartbeat=now()`). No SSE — clients poll.
- `GET /v1/pages/{id}/presence` — returns users with `last_heartbeat > now()-30s`.

## GCAutoSaves

Keeps the newest 20 `auto_save` revisions per page. Only `retention_class='keep_with_gc'` rows are eligible; rows with `status='current'` or `retention_class='keep_forever'` are never deleted. FK references between candidate rows are NULLed before deletion.

`auto_save` writes get `retention_class='keep_with_gc'`; all other sources get `keep_forever`.

## AI-Source Revisions (Inert Plumbing)

The `source` field accepts `'ai'` and `page_revisions` has `ai_tool_call_id uuid NULL`. No LLM calls are made in this module. AI-sourced revisions are stored and returned verbatim; any generation logic lives in a separate AI agent layer.
