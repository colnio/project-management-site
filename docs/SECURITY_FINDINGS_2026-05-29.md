# Security Findings — 2026-05-29 (remediated)

**Date reviewed:** 2026-05-29  
**Remediation completed:** 2026-05-29  
**Sources merged:** [`CODE_REVIEW.md`](./CODE_REVIEW.md) (point-in-time audit) and [`security-review-2026-05-29.md`](./security-review-2026-05-29.md) (trust-boundary review).  
**Prior review:** [`securityReview.md`](./securityReview.md) (2026-05-27, partially remediated before this pass).

This document is the canonical record of findings from the 2026-05-29 reviews and their remediation status. `make test` passes after all fixes below.

---

## Executive summary

| Severity | Found | Fixed |
|----------|-------|-------|
| Critical | 2 | 2 |
| High | 14 | 14 |
| Medium | 21 | 21 |
| Low / Info | 17 | 17 |

**New migrations:** `00132_backfill_pat_scopes.sql`, `00133_rate_limit_hits.sql`

**Production ops checklist:**
- Set strong `JWT_SIGNING_KEY`, `INVITE_SIGN_KEY`, and `DIGEST_SIGN_KEY` (≥32 bytes, not dev defaults)
- Set `COOKIE_SECURE=true` and `APP_ENV=production`
- Do not expose MinIO rendered bucket publicly; use presigned GETs from an isolated origin
- Run migrations before deploy
- Old two-part digest-unsubscribe links are invalid; new links include expiry

---

## Findings table

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| C1 | Critical | Insecure secret defaults usable in prod; no boot guard | **fixed** — `config.Load()` validates production secrets |
| CR2 | Critical | Scoped PATs self-escalate via unscoped auth endpoints | **fixed** — session-only PAT mgmt; `manage:tokens` / `write:profile` scopes |
| H1 | High | `approval.handleList` missing project authorization | **fixed** |
| H2 | High | Tool-call approve/reject not bound to conversation (IDOR) | **fixed** |
| H3 | High | Suspended/pending users retain PAT/AI token access | **fixed** — status gate + revoke on suspend |
| H4 | High | Login/register not rate-limited | **fixed** — IP limiter on auth endpoints |
| H5 | High | No max password length (argon2 DoS) | **fixed** — 1024-byte cap |
| H6 | High | No upload MIME allowlist + public rendered bucket risk | **fixed** — server allowlist; ops doc for bucket policy |
| H7 | High | Unsanitized filename in S3 key | **fixed** — `sanitizeFilename()` |
| H8 | High | Page ETag check outside write transaction | **fixed** — guard inside tx |
| H9 | High | `approval.Decide` non-atomic status update | **fixed** — `WHERE status='pending'` |
| H10 | High | Refresh-token rotation race | **fixed** — transactional conditional revoke |
| H11 | High | HTTP server missing read/idle timeouts | **fixed** — SSE-safe (no server WriteTimeout) |
| H12 | High | Compose binds 0.0.0.0 with default creds | **fixed** — 127.0.0.1 + internal network |
| H13 | High | Prompt injection via DB values in system prompt | **fixed** — XML delimiters + untrusted-data notice |
| H14 | High | AI SSE endpoint missing `write:ai` scope | **fixed** |
| M1 | Medium | Legacy empty-scope PATs bypass scope checks | **fixed** — migration 00132 + bypass removed |
| M2 | Medium | PAT scopes not validated at creation | **fixed** — allowlist validation |
| M3 | Medium | Workspace member → editor on workspace-visible projects | **fixed** — member → viewer |
| M4 | Medium | AI run GET skips authz when project_id NULL | **fixed** — 404 |
| M5 | Medium | Outbound HTTP clients without timeout | **fixed** — 30s clients in ai/mcp |
| M6 | Medium | Presigned PUT no size limit | **fixed** — content-length-range + LimitReader |
| M7 | Medium | CompleteUpload doesn't verify object/uploader | **fixed** — HeadObject + uploader/owner gate |
| M8 | Medium | Idempotency Lookup swallows DB errors | **fixed** — propagate → 503 |
| M9 | Medium | Multi-row mutations not transactional | **fixed** — org/project/risk txs |
| M10 | Medium | Revision pagination cursor missing id tie-break | **fixed** |
| M11 | Medium | `/docs` + OpenAPI public in prod | **fixed** — disabled when production |
| M12 | Medium | SMTP opportunistic TLS | **fixed** — required TLS for remote hosts |
| M13 | Medium | Calendar ICS token compare + URL logging | **fixed** — constant-time + log redaction |
| M14 | Medium | Sample relation child project not authorized | **fixed** |
| M15 | Medium | Frontend completes upload after failed PUT | **fixed** |
| M16 | Medium | Raw fetch bypasses 401 refresh | **fixed** — `apiFetchRaw` |
| M17 | Medium | In-memory rate limiter only | **fixed** — Postgres-backed + IP pruning |
| M18 | Medium | JWT lacks iss/aud | **fixed** |
| M19 | Medium | Calendar subscription lazy-create not audited | **fixed** |
| M20 | Medium | Permanent digest-unsubscribe bearer token | **fixed** — 90-day expiry + `DIGEST_SIGN_KEY` |
| M21 | Medium | Cross-module SQL boundary violations | **fixed** — owning-module APIs |
| L1 | Low | PAT hash compared with `!=` | **fixed** — constant-time |
| L2 | Low | SeedDevUser hardcodes password | **fixed** — env-gated |
| L3 | Low | Orphan user on registration failure | **fixed** — transactional register |
| L4 | Low | DeleteArtifact doesn't delete S3 objects | **fixed** — best-effort delete |
| L5 | Low | UpsertFromWorkflow swallows insert errors | **fixed** — fail in tx |
| L6 | Low | SSE parser unbounded buffer | **fixed** — 5 MiB cap |
| L7 | Low | Digest-unsubscribe reuses InviteSignKey | **fixed** — dedicated key |
| L8 | Low | N+1 in ListProjectsForWorkspace | **fixed** — batch access |
| L9 | Low | pgxpool defaults | **fixed** — env-configured |
| L10 | Low | Artifact worker ignores failArtifact / retries deleted | **fixed** |
| L11 | Info | Dead OIDC config + mock-oidc | **fixed** — removed |
| L12 | Info | Duplicate SSE invalidation in AIChatPanel | **fixed** |
| L13 | Info | Content-Type on bodyless requests | **fixed** |
| L14 | Info | SearXNG secret_key + limiter | **fixed** — documented + limiter on |
| SR-A | Low | Audit handler manual scope check | **fixed** — `RequireScope` |
| SR-B | Low | Share UI exposed without owner role | **fixed** — owner-gated |
| SR-C | Low | Inbox/home trust server links | **fixed** — `safeAppPath()` |

---

## Key implementation notes

### Auth & tokens
- New scopes: `manage:tokens`, `write:profile` (`internal/platform/scopes.go`)
- PAT management endpoints require browser session (PAT/iai callers rejected)
- JWT issuer `lab-pm-api`, audience `lab-pm-clients`
- Login/register: 20 req/min/IP (configurable via platform wiring)

### Cross-module APIs (M21)
- `auth.GetUsersByIDs` — org membership enrichment
- `project.GetProjectNames` / `project.ListIDsForWorkspace` — risk/AI workspace queries
- `risk.HasBlockingHighRisk` — iteration activation gate via `SetBlockingRiskChecker`

### Artifacts
- MIME allowlist in `internal/artifact/validation.go`
- Max upload 100 MiB with presigned content-length enforcement

### Rate limiting
- Postgres table `rate_limit_hits` (migration 00133), 2-minute TTL eviction
- In-memory fallback retained for tests without DB

---

## Verification

- `go test ./... -p 1` — pass
- `cd web && pnpm test --run` — 126 tests pass
- `internal/config` production guard tests — pass

---

## Positive observations (unchanged)

The 2026-05-29 reviews confirmed strong baseline hygiene: argon2id password hashing, JWT alg-confusion protection, hashed token storage, login enumeration resistance, consistent authorization pattern (gaps now closed), AI write double-gating, no SQL injection in dynamic queries, in-memory access tokens on frontend, artifact iframe sandbox without same-origin, CORS single-origin policy.
