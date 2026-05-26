# auth — Identity & Auth module (A1)

Local-password login, OIDC SSO, JWT access tokens, refresh sessions, personal access tokens (PATs), and internal AI tokens.

## Public Go API

### Service construction

```go
func NewService(
    ctx     context.Context,
    pool    *pgxpool.Pool,
    cfg     *config.Config,
    rec     audit.Recorder,
    log     *slog.Logger,
) (*Service, error)
```

Attempts OIDC provider discovery at `cfg.OIDCIssuer`; logs a warning and continues with `oidc == nil` if unreachable (local-password + token paths still work).

### HTTP registration

```go
func Register(api huma.API, svc *Service)
```

### User type

```go
type User struct {
    ID            uuid.UUID
    Email         string
    DisplayName   string
    IsSystemAdmin bool
    CreatedAt     time.Time
    UpdatedAt     time.Time
}
```

### User CRUD

```go
func (s *Service) GetUserByEmail(ctx context.Context, email string) (*User, error)
func (s *Service) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error)
func (s *Service) CreateUser(ctx context.Context, email, displayName string) (*User, error)
func (s *Service) SetPassword(ctx context.Context, userID uuid.UUID, password string) error
```

- `CreateUser` lowercases the email; returns `platform.Conflict` on duplicate.
- `GetUserByEmail` / `GetUserByID` return `platform.NotFound` if absent.

### Three Verify* methods (called by auth middleware)

```go
func (s *Service) VerifyAccessToken(ctx context.Context, raw string) (*platform.Principal, error)
func (s *Service) VerifyPAT(ctx context.Context, raw string) (*platform.Principal, error)
func (s *Service) VerifyInternalAIToken(ctx context.Context, raw string) (*platform.Principal, error)
```

All return a `*platform.Principal` on success or a `platform.Unauthorized` error. No Via* fields are set on VerifyAccessToken (first-party session). `VerifyPAT` sets `ViaTokenID`; `VerifyInternalAIToken` sets `ViaAIConversationID`.

### Internal AI token plumbing

```go
func (s *Service) MintInternalAIToken(
    ctx          context.Context,
    userID       uuid.UUID,
    convOrRunID  uuid.UUID,
    scopes       []string,
    perms        json.RawMessage,
) (rawToken string, err error)

func (s *Service) RevokeInternalAITokens(ctx context.Context, convOrRunID uuid.UUID) error
```

TTL is hard-coded to 15 minutes. Revokes all tokens for the given conversation/run.

### Seed helper

```go
func (s *Service) SeedDevUser(ctx context.Context) error
```

Upserts `dev@halide-lab.org` / `Dev User` / `is_system_admin=true` / password `devpassword`. Idempotent.

## HTTP Endpoints

| Method | Path | Auth required | Description |
|--------|------|:---:|-------------|
| GET | `/v1/auth/oidc/login` | No | Returns `{authorization_url, state}`. 503 if OIDC unavailable. |
| GET | `/v1/auth/oidc/callback` | No | Exchanges OIDC code, upserts user, sets refresh cookie, redirects to `WebOrigin`. |
| POST | `/v1/auth/login` | No | `{email, password}` → `{access_token, user}` + httpOnly refresh cookie. |
| POST | `/v1/auth/refresh` | Cookie | Rotates refresh token, returns new `{access_token}` + new cookie. |
| POST | `/v1/auth/logout` | Cookie | Revokes refresh session, clears cookie. |
| GET | `/v1/me` | Principal on ctx | Returns current user JSON. |
| POST | `/v1/tokens` | Principal on ctx | `{name, scopes[], expires_at?}` → `{id, token, name, scopes, expires_at}`. |
| GET | `/v1/tokens` | Principal on ctx | Lists caller's PATs (no secrets). |
| DELETE | `/v1/tokens/{id}` | Principal on ctx | Revokes own PAT. |

## Token Formats

| Type | Prefix | Storage | TTL |
|------|--------|---------|-----|
| Access JWT | (HS256 JWT) | stateless, `JWTSigningKey` | `AccessTokenTTL` (default 15 min) |
| Refresh token | (opaque base64url 32 bytes) | sha256 hex in `refresh_sessions` | `RefreshTokenTTL` (default 720 h) |
| PAT | `pat_` | sha256 hex in `personal_access_tokens`, prefix first 12 chars | optional `expires_at` |
| Internal AI token | `iai_` | sha256 hex in `internal_ai_tokens`, prefix first 12 chars | 15 min hard-coded |

## Scopes

Scopes are free-form strings stored on PATs and internal AI tokens. The `Principal.HasScope(s)` method returns `true` for any scope on a first-party session (no Via* fields), and checks the `Scopes` slice otherwise. The auth module does not enforce specific scope values — domain modules define and check their own scope strings.

## Database tables (migration 00020)

`users`, `local_credentials`, `refresh_sessions`, `personal_access_tokens`, `internal_ai_tokens`.
