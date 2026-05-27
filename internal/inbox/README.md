# Inbox Module (H2)

A **read-only aggregation** that unions several existing signals into a single
per-workspace inbox feed. It owns no tables — it reads from `risks`,
`ai_tool_calls` (joined to conversations→projects), and the audit log.

## Domain struct

```go
type Item struct {
    ID        string    // synthetic, source-prefixed
    Kind      string    // pi_flag|ai_proposal|action_item|comment|system|mention
    Title     string
    Body      string
    Link      string    // deep-link into the SPA (e.g. /projects/<id>)
    CreatedAt time.Time
}
```

## Service

```go
func NewService(pool *pgxpool.Pool, org *org.Service, log *slog.Logger) *Service
func Register(api huma.API, svc *Service)
func (s *Service) AggregateForWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]Item, error)
```

## Sources

- **`pi_flag`** — risks where `flagged_for_pi_review = true` (links to the project).
- **`ai_proposal`** — `ai_tool_calls` with `status = 'proposed'` in the workspace's projects.
- **`system`** — recent audit-log entries.

Results are ordered by `created_at` descending and capped (~50). Authorization
requires workspace membership.

## HTTP Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/workspaces/{id}/inbox` | Aggregated inbox feed. |

## Migrations

- `00123_inbox_indexes.sql`: a partial index on `risks(project_id, flagged_for_pi_review)` to support the aggregation. (No inbox table.)
