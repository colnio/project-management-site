# Notify module

Owns transactional email delivery, user notification preferences, daily inbox
digests, and admin broadcast announcements.

## Tables

- `email_outbox` — durable queue with idempotency keys; River `send_email` worker delivers rows.
- `user_notification_prefs` — per-user email category toggles.
- `email_digest_watermarks` — reserved for future per-user digest cursors (digest uses daily idempotency keys).
- `admin_broadcasts` — audit trail for admin announcements.

## Service

```go
func NewService(pool *pgxpool.Pool, cfg *config.Config, rec audit.Recorder, log *slog.Logger) *Service
func (s *Service) Enqueue(ctx context.Context, p EnqueueParams) error
func Register(api huma.API, svc *Service)
func RegisterWorkers(w *river.Workers, deps WorkerDeps)
```

Domain modules call typed helpers (`EnqueueWorkspaceInvite`, `EnqueueApprovalPending`, …) or `Enqueue` directly. Delivery is asynchronous via River unless the enqueuer is not wired (logs a warning).

## HTTP

| Method | Path | Scope | Notes |
|--------|------|-------|-------|
| `GET` | `/v1/me/notification-preferences` | `read:notify` | Lists categories with `mandatory` flag |
| `PATCH` | `/v1/me/notification-preferences` | `write:notify` | Body: `{ "preferences": { "pi_flag": true, … } }` |
| `POST` | `/v1/admin/broadcasts` | `write:admin` + privileged | Sends mandatory broadcast email |
| `GET` | `/v1/notify/digest/unsubscribe?token=…` | Public | One-click digest opt-out |

## Mandatory categories

`account`, `security`, `admin_broadcast` — cannot be disabled in settings.

## Migrations

- `00131_notify.sql`
