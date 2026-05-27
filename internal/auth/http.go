package auth

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"golang.org/x/oauth2"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires auth HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// OIDC login initiation.
	huma.Register(api, huma.Operation{
		OperationID: "auth-oidc-login",
		Method:      http.MethodGet,
		Path:        "/v1/auth/oidc/login",
		Summary:     "Begin OIDC login flow",
		Description: "Returns an authorization URL and state token to start an OIDC login. Redirect the user's browser to the returned `authorization_url`.",
		Tags:        []string{"auth"},
	}, svc.handleOIDCLogin)

	// OIDC callback.
	huma.Register(api, huma.Operation{
		OperationID: "auth-oidc-callback",
		Method:      http.MethodGet,
		Path:        "/v1/auth/oidc/callback",
		Summary:     "OIDC callback — exchange code for session",
		Description: "Handled by the OIDC provider redirect. Exchanges the authorization code for a session, sets a `refresh_token` HttpOnly cookie, and redirects to the web origin.",
		Tags:        []string{"auth"},
	}, svc.handleOIDCCallback)

	// Local login.
	huma.Register(api, huma.Operation{
		OperationID: "auth-login",
		Method:      http.MethodPost,
		Path:        "/v1/auth/login",
		Summary:     "Local email+password login",
		Description: "Authenticates a user with an email and password. Returns a short-lived `access_token` (JWT) in the body and sets a `refresh_token` HttpOnly cookie.",
		Tags:        []string{"auth"},
	}, svc.handleLogin)

	// Refresh.
	huma.Register(api, huma.Operation{
		OperationID: "auth-refresh",
		Method:      http.MethodPost,
		Path:        "/v1/auth/refresh",
		Summary:     "Rotate refresh token and issue a new access token",
		Description: "Rotates the `refresh_token` cookie (single-use) and returns a fresh `access_token`. The frontend retries any 401 automatically via this endpoint.",
		Tags:        []string{"auth"},
	}, svc.handleRefresh)

	// Logout.
	huma.Register(api, huma.Operation{
		OperationID: "auth-logout",
		Method:      http.MethodPost,
		Path:        "/v1/auth/logout",
		Summary:     "Revoke refresh session (logout)",
		Description: "Revokes the caller's current refresh session and clears the `refresh_token` cookie. Subsequent refresh attempts will fail.",
		Tags:        []string{"auth"},
	}, svc.handleLogout)

	// Current user.
	huma.Register(api, huma.Operation{
		OperationID: "auth-me",
		Method:      http.MethodGet,
		Path:        "/v1/me",
		Summary:     "Get current authenticated user",
		Description: "Returns the authenticated user's profile (ID, email, display name, admin flag). Requires a valid `Authorization: Bearer <access_token>` header.",
		Tags:        []string{"auth"},
	}, svc.handleMe)

	// PAT CRUD.
	huma.Register(api, huma.Operation{
		OperationID: "auth-token-create",
		Method:      http.MethodPost,
		Path:        "/v1/tokens",
		Summary:     "Create a personal access token",
		Description: "Creates a new long-lived personal access token (PAT) scoped to specific operations. The raw token is returned only once — store it securely. Requires an authenticated session.",
		Tags:        []string{"tokens"},
	}, svc.handleCreateToken)

	huma.Register(api, huma.Operation{
		OperationID: "auth-token-list",
		Method:      http.MethodGet,
		Path:        "/v1/tokens",
		Summary:     "List personal access tokens",
		Description: "Returns metadata for all personal access tokens owned by the caller (raw token values are never returned). Requires an authenticated session.",
		Tags:        []string{"tokens"},
	}, svc.handleListTokens)

	huma.Register(api, huma.Operation{
		OperationID: "auth-token-revoke",
		Method:      http.MethodDelete,
		Path:        "/v1/tokens/{id}",
		Summary:     "Revoke a personal access token",
		Description: "Permanently revokes a personal access token. The caller must own the token. Requires an authenticated session.",
		Tags:        []string{"tokens"},
	}, svc.handleRevokeToken)
}

// ─── Cookie helper ───────────────────────────────────────────────────────────

func (s *Service) refreshCookieValue(token string) string {
	maxAge := int(s.cfg.RefreshTokenTTL.Seconds())
	c := &http.Cookie{
		Name:     "refresh_token",
		Value:    token,
		Path:     "/",
		Domain:   s.cfg.CookieDomain,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
	return c.String()
}

func (s *Service) clearRefreshCookie() string {
	c := &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/",
		Domain:   s.cfg.CookieDomain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
	return c.String()
}

// ─── OIDC login ──────────────────────────────────────────────────────────────

type oidcLoginOutput struct {
	SetCookie string `header:"Set-Cookie"`
	Body      struct {
		AuthorizationURL string `json:"authorization_url"`
		State            string `json:"state"`
	}
}

func (s *Service) handleOIDCLogin(_ context.Context, _ *struct{}) (*oidcLoginOutput, error) {
	if s.oidc == nil {
		return nil, platform.Errorf(http.StatusServiceUnavailable, "oidc.unavailable", "OIDC provider is not configured or unreachable")
	}
	state, err := randomBase64url(16)
	if err != nil {
		return nil, fmt.Errorf("auth: generate state: %w", err)
	}
	oauth2Cfg := s.oauth2Config()
	url := oauth2Cfg.AuthCodeURL(state, oauth2.AccessTypeOnline)
	out := &oidcLoginOutput{}
	out.Body.AuthorizationURL = url
	out.Body.State = state
	// Bind state to browser via HttpOnly cookie so the callback can verify it.
	stateCookie := &http.Cookie{
		Name:     "oidc_state",
		Value:    state,
		Path:     "/",
		Domain:   s.cfg.CookieDomain,
		MaxAge:   300, // 5 minutes is plenty for the OIDC round-trip
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
	out.SetCookie = stateCookie.String()
	return out, nil
}

// ─── OIDC callback ───────────────────────────────────────────────────────────

type oidcCallbackInput struct {
	Code   string `query:"code"`
	State  string `query:"state"`
	Cookie string `header:"Cookie"`
}

type oidcCallbackOutput struct {
	Status    int
	Location  string   `header:"Location"`
	SetCookie []string `header:"Set-Cookie"`
}

func (s *Service) handleOIDCCallback(ctx context.Context, in *oidcCallbackInput) (*oidcCallbackOutput, error) {
	if s.oidc == nil {
		return nil, platform.Errorf(http.StatusServiceUnavailable, "oidc.unavailable", "OIDC provider not available")
	}

	// Verify OIDC state to prevent CSRF.
	cookieState := extractCookieValue(in.Cookie, "oidc_state")
	if cookieState == "" || cookieState != in.State {
		return nil, platform.Unauthorized("oidc state mismatch")
	}

	oauth2Cfg := s.oauth2Config()
	oauthToken, err := oauth2Cfg.Exchange(ctx, in.Code)
	if err != nil {
		return nil, platform.BadRequest("oidc.exchange_failed", "could not exchange OIDC code")
	}

	rawIDToken, ok := oauthToken.Extra("id_token").(string)
	if !ok {
		return nil, platform.BadRequest("oidc.no_id_token", "no id_token in OIDC response")
	}
	idToken, err := s.oidc.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, platform.Unauthorized("invalid OIDC id_token")
	}

	var claims struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return nil, platform.BadRequest("oidc.claims_failed", "cannot extract claims from id_token")
	}

	if !emailDomainAllowed(claims.Email, s.cfg.AllowedEmailDomains) {
		return nil, platform.Forbidden("email domain not allowed")
	}

	// Upsert user.
	u, err := s.GetUserByEmail(ctx, claims.Email)
	if err != nil {
		u, err = s.CreateUser(ctx, claims.Email, claims.Name)
		if err != nil {
			return nil, err
		}
	}

	refresh, err := s.issueRefresh(ctx, u.ID)
	if err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        u.ID,
		Action:       "auth.login",
		ResourceType: "user",
		ResourceID:   u.ID.String(),
	})

	// Clear the oidc_state cookie (MaxAge -1) and set the refresh token cookie.
	clearState := &http.Cookie{
		Name:     "oidc_state",
		Value:    "",
		Path:     "/",
		Domain:   s.cfg.CookieDomain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
	out := &oidcCallbackOutput{
		Status:   http.StatusFound,
		Location: s.cfg.WebOrigin,
		SetCookie: []string{
			s.refreshCookieValue(refresh),
			clearState.String(),
		},
	}
	return out, nil
}

func (s *Service) oauth2Config() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.cfg.OIDCClientID,
		ClientSecret: s.cfg.OIDCClientSecret,
		RedirectURL:  s.cfg.OIDCRedirectURL,
		Endpoint:     s.oidc.provider.Endpoint(),
		Scopes:       []string{"openid", "email", "profile"},
	}
}

// ─── Local login ─────────────────────────────────────────────────────────────

type loginInput struct {
	Body struct {
		Email    string `json:"email" required:"true"`
		Password string `json:"password" required:"true"`
	}
}

type loginOutput struct {
	SetCookie string `header:"Set-Cookie"`
	Body      struct {
		AccessToken string   `json:"access_token"`
		User        userJSON `json:"user"`
	}
}

type userJSON struct {
	ID            uuid.UUID `json:"id"`
	Email         string    `json:"email"`
	DisplayName   string    `json:"display_name"`
	IsSystemAdmin bool      `json:"is_system_admin"`
	CreatedAt     time.Time `json:"created_at"`
}

func userToJSON(u *User) userJSON {
	return userJSON{
		ID:            u.ID,
		Email:         u.Email,
		DisplayName:   u.DisplayName,
		IsSystemAdmin: u.IsSystemAdmin,
		CreatedAt:     u.CreatedAt,
	}
}

func (s *Service) handleLogin(ctx context.Context, in *loginInput) (*loginOutput, error) {
	u, err := s.verifyLocalLogin(ctx, in.Body.Email, in.Body.Password)
	if err != nil {
		return nil, err
	}
	accessToken, err := s.issueAccessToken(u)
	if err != nil {
		return nil, fmt.Errorf("auth: issue access token: %w", err)
	}
	refresh, err := s.issueRefresh(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        u.ID,
		Action:       "auth.login",
		ResourceType: "user",
		ResourceID:   u.ID.String(),
	})
	out := &loginOutput{}
	out.SetCookie = s.refreshCookieValue(refresh)
	out.Body.AccessToken = accessToken
	out.Body.User = userToJSON(u)
	return out, nil
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

type refreshCookieInput struct {
	Cookie string `header:"Cookie"`
}

type refreshOutput struct {
	SetCookie string `header:"Set-Cookie"`
	Body      struct {
		AccessToken string `json:"access_token"`
	}
}

func (s *Service) handleRefresh(ctx context.Context, in *refreshCookieInput) (*refreshOutput, error) {
	raw := extractCookieValue(in.Cookie, "refresh_token")
	if raw == "" {
		return nil, platform.Unauthorized("missing refresh token cookie")
	}
	newRaw, u, err := s.rotateRefresh(ctx, raw)
	if err != nil {
		return nil, err
	}
	accessToken, err := s.issueAccessToken(u)
	if err != nil {
		return nil, fmt.Errorf("auth: issue access token: %w", err)
	}
	out := &refreshOutput{}
	out.SetCookie = s.refreshCookieValue(newRaw)
	out.Body.AccessToken = accessToken
	return out, nil
}

// ─── Logout ──────────────────────────────────────────────────────────────────

type logoutCookieInput struct {
	Cookie string `header:"Cookie"`
}

type logoutOutput struct {
	SetCookie string `header:"Set-Cookie"`
	Body      struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleLogout(ctx context.Context, in *logoutCookieInput) (*logoutOutput, error) {
	raw := extractCookieValue(in.Cookie, "refresh_token")
	if raw != "" {
		_ = s.revokeRefresh(ctx, raw)
	}
	out := &logoutOutput{}
	out.SetCookie = s.clearRefreshCookie()
	out.Body.OK = true
	return out, nil
}

// extractCookieValue parses a raw Cookie header value and returns the named cookie value.
func extractCookieValue(cookieHeader, name string) string {
	header := http.Header{}
	header.Add("Cookie", cookieHeader)
	req := &http.Request{Header: header}
	c, err := req.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}

// ─── /v1/me ─────────────────────────────────────────────────────────────────

type meOutput struct {
	Body userJSON
}

func (s *Service) handleMe(ctx context.Context, _ *struct{}) (*meOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	u, err := s.GetUserByID(ctx, p.UserID)
	if err != nil {
		return nil, err
	}
	return &meOutput{Body: userToJSON(u)}, nil
}

// ─── PAT create ──────────────────────────────────────────────────────────────

type createTokenInput struct {
	Body struct {
		Name      string     `json:"name" required:"true"`
		Scopes    []string   `json:"scopes"`
		ExpiresAt *time.Time `json:"expires_at,omitempty"`
	}
}

type createTokenOutput struct {
	Body struct {
		ID        uuid.UUID  `json:"id"`
		Token     string     `json:"token"`
		Name      string     `json:"name"`
		Scopes    []string   `json:"scopes"`
		ExpiresAt *time.Time `json:"expires_at,omitempty"`
	}
}

func (s *Service) handleCreateToken(ctx context.Context, in *createTokenInput) (*createTokenOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	id, rawToken, err := s.createPAT(ctx, p.UserID, in.Body.Name, in.Body.Scopes, in.Body.ExpiresAt)
	if err != nil {
		return nil, err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "token.create",
		ResourceType: "personal_access_token",
		ResourceID:   id.String(),
	})
	out := &createTokenOutput{}
	out.Body.ID = id
	out.Body.Token = rawToken
	out.Body.Name = in.Body.Name
	out.Body.Scopes = in.Body.Scopes
	out.Body.ExpiresAt = in.Body.ExpiresAt
	return out, nil
}

// ─── PAT list ────────────────────────────────────────────────────────────────

type listTokensOutput struct {
	Body []PATInfo
}

func (s *Service) handleListTokens(ctx context.Context, _ *struct{}) (*listTokensOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	tokens, err := s.listPATs(ctx, p.UserID)
	if err != nil {
		return nil, err
	}
	if tokens == nil {
		tokens = []PATInfo{}
	}
	return &listTokensOutput{Body: tokens}, nil
}

// ─── PAT revoke ──────────────────────────────────────────────────────────────

type revokeTokenInput struct {
	ID uuid.UUID `path:"id"`
}

type revokeTokenOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleRevokeToken(ctx context.Context, in *revokeTokenInput) (*revokeTokenOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := s.revokePAT(ctx, p.UserID, in.ID); err != nil {
		return nil, err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "token.revoke",
		ResourceType: "personal_access_token",
		ResourceID:   in.ID.String(),
	})
	return &revokeTokenOutput{Body: struct{ OK bool `json:"ok"` }{OK: true}}, nil
}
