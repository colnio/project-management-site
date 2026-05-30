package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/colnio/project-management-site/internal/platform"
)

type dbExec interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

const (
	jwtIssuer   = "lab-pm-api"
	jwtAudience = "lab-pm-clients"
)

// ─── Access JWT ─────────────────────────────────────────────────────────────

type accessClaims struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

// issueAccessToken mints an HS256 JWT for u.
func (s *Service) issueAccessToken(u *User) (string, error) {
	now := time.Now()
	claims := accessClaims{
		Email: u.Email,
		Role:  u.GlobalRole,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    jwtIssuer,
			Audience:  jwt.ClaimStrings{jwtAudience},
			Subject:   u.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.AccessTokenTTL)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString([]byte(s.cfg.JWTSigningKey))
}

// VerifyAccessToken parses and validates an HS256 JWT and returns a Principal.
// ViaTokenID and ViaAIConversationID are both nil (first-party session).
func (s *Service) VerifyAccessToken(_ context.Context, raw string) (*platform.Principal, error) {
	tok, err := jwt.ParseWithClaims(raw, &accessClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("auth: unexpected signing method %v", t.Header["alg"])
		}
		return []byte(s.cfg.JWTSigningKey), nil
	}, jwt.WithIssuer(jwtIssuer), jwt.WithAudience(jwtAudience))
	if err != nil {
		return nil, platform.Unauthorized("invalid or expired access token")
	}
	claims, ok := tok.Claims.(*accessClaims)
	if !ok || !tok.Valid {
		return nil, platform.Unauthorized("invalid access token claims")
	}
	userID, err := uuid.Parse(claims.Subject)
	if err != nil {
		return nil, platform.Unauthorized("invalid subject in access token")
	}
	return &platform.Principal{
		UserID:     userID,
		Email:      claims.Email,
		GlobalRole: claims.Role,
	}, nil
}

// ─── Refresh token ───────────────────────────────────────────────────────────

func randomBase64url(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func hashMatches(stored, computed string) bool {
	return subtle.ConstantTimeCompare([]byte(stored), []byte(computed)) == 1
}

// issueRefresh creates a refresh session in the DB and returns the opaque token.
func (s *Service) issueRefresh(ctx context.Context, userID uuid.UUID) (string, error) {
	return s.issueRefreshExec(ctx, s.pool, userID)
}

func (s *Service) issueRefreshExec(ctx context.Context, db dbExec, userID uuid.UUID) (string, error) {
	raw, err := randomBase64url(32)
	if err != nil {
		return "", err
	}
	hash := sha256Hex(raw)
	expiresAt := time.Now().Add(s.cfg.RefreshTokenTTL)
	_, err = db.Exec(ctx,
		`INSERT INTO refresh_sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
		userID, hash, expiresAt,
	)
	if err != nil {
		return "", fmt.Errorf("auth: create refresh session: %w", err)
	}
	return raw, nil
}

// rotateRefresh validates the old token, revokes it atomically, and issues a new one.
func (s *Service) rotateRefresh(ctx context.Context, raw string) (string, *User, error) {
	hash := sha256Hex(raw)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", nil, fmt.Errorf("auth: begin refresh rotation tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var sessionID uuid.UUID
	var userID uuid.UUID
	var expiresAt time.Time
	var revokedAt *time.Time
	err = tx.QueryRow(ctx,
		`SELECT id, user_id, expires_at, revoked_at FROM refresh_sessions WHERE token_hash=$1 FOR UPDATE`,
		hash,
	).Scan(&sessionID, &userID, &expiresAt, &revokedAt)
	if err == pgx.ErrNoRows {
		return "", nil, platform.Unauthorized("refresh token not found")
	}
	if err != nil {
		return "", nil, fmt.Errorf("auth: lookup refresh: %w", err)
	}
	if revokedAt != nil {
		return "", nil, platform.Unauthorized("refresh token revoked")
	}
	if time.Now().After(expiresAt) {
		return "", nil, platform.Unauthorized("refresh token expired")
	}
	tag, err := tx.Exec(ctx,
		`UPDATE refresh_sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL`,
		sessionID,
	)
	if err != nil {
		return "", nil, fmt.Errorf("auth: revoke old refresh: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return "", nil, platform.Unauthorized("refresh token revoked")
	}

	u, err := s.getUserByIDTx(ctx, tx, userID)
	if err != nil {
		return "", nil, err
	}
	switch u.Status {
	case "pending":
		return "", nil, platform.Errorf(http.StatusForbidden, "auth.pending_approval", "your account is awaiting approval")
	case "suspended":
		return "", nil, platform.Errorf(http.StatusForbidden, "auth.suspended", "your account has been suspended")
	}

	newRaw, err := s.issueRefreshExec(ctx, tx, userID)
	if err != nil {
		return "", nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", nil, fmt.Errorf("auth: commit refresh rotation: %w", err)
	}
	return newRaw, u, nil
}

// revokeRefresh revokes a refresh session by raw token.
func (s *Service) revokeRefresh(ctx context.Context, raw string) error {
	hash := sha256Hex(raw)
	_, err := s.pool.Exec(ctx,
		`UPDATE refresh_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL`,
		hash,
	)
	return err
}

// ─── Personal Access Tokens ──────────────────────────────────────────────────

const patPrefix = "pat_"

// createPAT mints a new personal access token and stores it.
func (s *Service) createPAT(ctx context.Context, userID uuid.UUID, name string, scopes []string, expiresAt *time.Time) (id uuid.UUID, rawToken string, err error) {
	if err := platform.ValidatePATScopes(scopes); err != nil {
		return uuid.Nil, "", err
	}
	raw, e := randomBase64url(32)
	if e != nil {
		return uuid.Nil, "", e
	}
	rawToken = patPrefix + raw
	hash := sha256Hex(rawToken)
	prefix := rawToken
	if len(prefix) > 12 {
		prefix = prefix[:12]
	}

	err = s.pool.QueryRow(ctx,
		`INSERT INTO personal_access_tokens (user_id, name, token_hash, token_prefix, scopes, expires_at)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		userID, name, hash, prefix, scopes, expiresAt,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("auth: create PAT: %w", err)
	}
	return id, rawToken, nil
}

// VerifyPAT validates a raw PAT string and returns a Principal with ViaTokenID set.
func (s *Service) VerifyPAT(ctx context.Context, raw string) (*platform.Principal, error) {
	if len(raw) < 12 {
		return nil, platform.Unauthorized("invalid token format")
	}
	prefix := raw
	if len(prefix) > 12 {
		prefix = prefix[:12]
	}
	hash := sha256Hex(raw)

	type row struct {
		id        uuid.UUID
		userID    uuid.UUID
		storedHash string
		scopes    []string
		expiresAt *time.Time
		revokedAt *time.Time
	}
	var r row
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, token_hash, scopes, expires_at, revoked_at
		 FROM personal_access_tokens WHERE token_prefix=$1`,
		prefix,
	).Scan(&r.id, &r.userID, &r.storedHash, &r.scopes, &r.expiresAt, &r.revokedAt)
	if err == pgx.ErrNoRows {
		return nil, platform.Unauthorized("token not found")
	}
	if err != nil {
		return nil, fmt.Errorf("auth: PAT lookup: %w", err)
	}
	if !hashMatches(r.storedHash, hash) {
		return nil, platform.Unauthorized("invalid token")
	}
	if r.revokedAt != nil {
		return nil, platform.Unauthorized("token revoked")
	}
	if r.expiresAt != nil && time.Now().After(*r.expiresAt) {
		return nil, platform.Unauthorized("token expired")
	}

	// Update last_used_at async-ish (fire and forget — best effort).
	_, _ = s.pool.Exec(ctx, `UPDATE personal_access_tokens SET last_used_at=now() WHERE id=$1`, r.id)

	u, err := s.GetUserByID(ctx, r.userID)
	if err != nil {
		return nil, err
	}
	if err := rejectInactiveUser(u); err != nil {
		return nil, err
	}
	tokenID := r.id
	return &platform.Principal{
		UserID:     u.ID,
		Email:      u.Email,
		GlobalRole: u.GlobalRole,
		ViaTokenID: &tokenID,
		Scopes:     r.scopes,
	}, nil
}

// revokePAT revokes a PAT by id, only if owned by ownerID.
func (s *Service) revokePAT(ctx context.Context, ownerID, tokenID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE personal_access_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`,
		tokenID, ownerID,
	)
	if err != nil {
		return fmt.Errorf("auth: revoke PAT: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("token.not_found", "token not found or already revoked")
	}
	return nil
}

// listPATs returns all PATs for a user (no secrets).
type PATInfo struct {
	ID         uuid.UUID  `json:"id"`
	Name       string     `json:"name"`
	Scopes     []string   `json:"scopes"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

func (s *Service) listPATs(ctx context.Context, userID uuid.UUID) ([]PATInfo, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, scopes, expires_at, revoked_at, last_used_at, created_at
		 FROM personal_access_tokens WHERE user_id=$1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("auth: list PATs: %w", err)
	}
	defer rows.Close()
	var out []PATInfo
	for rows.Next() {
		var p PATInfo
		if err := rows.Scan(&p.ID, &p.Name, &p.Scopes, &p.ExpiresAt, &p.RevokedAt, &p.LastUsedAt, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ─── Internal AI Tokens ──────────────────────────────────────────────────────

const internalAIPrefix = "iai_"
const internalAITTL = 15 * time.Minute

// MintInternalAIToken creates a short-lived token for an AI conversation/run.
func (s *Service) MintInternalAIToken(ctx context.Context, userID, convOrRunID uuid.UUID, scopes []string, perms json.RawMessage) (rawToken string, err error) {
	raw, e := randomBase64url(32)
	if e != nil {
		return "", e
	}
	rawToken = internalAIPrefix + raw
	hash := sha256Hex(rawToken)
	prefix := rawToken
	if len(prefix) > 12 {
		prefix = prefix[:12]
	}
	expiresAt := time.Now().Add(internalAITTL)
	if perms == nil {
		perms = json.RawMessage("{}")
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO internal_ai_tokens
		 (user_id, conversation_or_run_id, token_hash, token_prefix, scopes_snapshot, permissions_snapshot, expires_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		userID, convOrRunID, hash, prefix, scopes, []byte(perms), expiresAt,
	)
	if err != nil {
		return "", fmt.Errorf("auth: mint internal AI token: %w", err)
	}
	return rawToken, nil
}

// VerifyInternalAIToken validates an iai_ token and returns a Principal with ViaAIConversationID set.
func (s *Service) VerifyInternalAIToken(ctx context.Context, raw string) (*platform.Principal, error) {
	if len(raw) < 12 {
		return nil, platform.Unauthorized("invalid token format")
	}
	prefix := raw
	if len(prefix) > 12 {
		prefix = prefix[:12]
	}
	hash := sha256Hex(raw)

	var id uuid.UUID
	var userID uuid.UUID
	var convOrRunID uuid.UUID
	var storedHash string
	var scopes []string
	var expiresAt time.Time
	var revokedAt *time.Time

	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, conversation_or_run_id, token_hash, scopes_snapshot, expires_at, revoked_at
		 FROM internal_ai_tokens WHERE token_prefix=$1`,
		prefix,
	).Scan(&id, &userID, &convOrRunID, &storedHash, &scopes, &expiresAt, &revokedAt)
	if err == pgx.ErrNoRows {
		return nil, platform.Unauthorized("token not found")
	}
	if err != nil {
		return nil, fmt.Errorf("auth: internal AI token lookup: %w", err)
	}
	if !hashMatches(storedHash, hash) {
		return nil, platform.Unauthorized("invalid token")
	}
	if revokedAt != nil {
		return nil, platform.Unauthorized("token revoked")
	}
	if time.Now().After(expiresAt) {
		return nil, platform.Unauthorized("token expired")
	}

	u, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if err := rejectInactiveUser(u); err != nil {
		return nil, err
	}
	convID := convOrRunID
	return &platform.Principal{
		UserID:              u.ID,
		Email:               u.Email,
		GlobalRole:          u.GlobalRole,
		ViaAIConversationID: &convID,
		Scopes:              scopes,
	}, nil
}

func rejectInactiveUser(u *User) error {
	switch u.Status {
	case "pending":
		return platform.Errorf(http.StatusForbidden, "auth.pending_approval", "your account is awaiting approval")
	case "suspended":
		return platform.Errorf(http.StatusForbidden, "auth.suspended", "your account has been suspended")
	}
	return nil
}

// RevokeAllUserPATs revokes every active personal access token for a user.
func (s *Service) RevokeAllUserPATs(ctx context.Context, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE personal_access_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("auth: revoke all PATs: %w", err)
	}
	return nil
}

// RevokeAllUserRefreshSessions revokes every active refresh session for a user.
func (s *Service) RevokeAllUserRefreshSessions(ctx context.Context, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("auth: revoke all refresh sessions: %w", err)
	}
	return nil
}

// RevokeInternalAITokens revokes all non-expired tokens for a conversation/run.
func (s *Service) RevokeInternalAITokens(ctx context.Context, convOrRunID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE internal_ai_tokens SET revoked_at=now()
		 WHERE conversation_or_run_id=$1 AND revoked_at IS NULL`,
		convOrRunID,
	)
	return err
}
