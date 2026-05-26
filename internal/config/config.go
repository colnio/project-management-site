// Package config loads runtime configuration from environment variables.
// In production the same loader reads a sealed .env; locally it reads .env.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all runtime configuration. Every cloud dependency is reached
// through an endpoint override so application code is identical in dev and prod.
type Config struct {
	Env  string // "development" | "production"
	Port string

	DatabaseURL string

	// Object storage (MinIO locally, S3 in prod) — AWS SDK + endpoint override.
	S3Endpoint        string
	S3Region          string
	S3AccessKey       string
	S3SecretKey       string
	S3UsePathStyle    bool
	BucketOriginals   string
	BucketRendered    string
	S3PublicURLBase   string // base URL the browser uses to reach object storage

	// Email (Mailpit locally, SES in prod) — standard SMTP.
	SMTPHost string
	SMTPPort string
	SMTPFrom string

	// Human SSO (mock-oauth2-server locally, Entra in prod).
	OIDCIssuer       string
	OIDCClientID     string
	OIDCClientSecret string
	OIDCRedirectURL  string

	// Auth signing + cookies.
	JWTSigningKey  string
	InviteSignKey  string
	AccessTokenTTL time.Duration
	RefreshTokenTTL time.Duration
	CookieDomain   string
	CookieSecure   bool

	// Allow-listed email domains for SSO sign-in (comma-separated in env).
	AllowedEmailDomains []string

	// Frontend origin for CORS / redirects.
	WebOrigin string

	// nbconvert sidecar.
	NBConvertURL string

	// SearXNG (agent web search). Kept here so config stays in one place even
	// though the AI track is not yet built.
	SearxNGURL string
}

// Load reads configuration from the environment. Missing required values for
// the selected environment cause an error.
func Load() (*Config, error) {
	c := &Config{
		Env:             getenv("APP_ENV", "development"),
		Port:            getenv("PORT", "8080"),
		DatabaseURL:     getenv("DATABASE_URL", "postgres://lab:lab@localhost:5432/lab?sslmode=disable"),
		S3Endpoint:      getenv("S3_ENDPOINT", "http://localhost:9000"),
		S3Region:        getenv("S3_REGION", "us-east-1"),
		S3AccessKey:     getenv("S3_ACCESS_KEY", "minioadmin"),
		S3SecretKey:     getenv("S3_SECRET_KEY", "minioadmin"),
		S3UsePathStyle:  getbool("S3_USE_PATH_STYLE", true),
		BucketOriginals: getenv("S3_BUCKET_ORIGINALS", "artifacts-originals"),
		BucketRendered:  getenv("S3_BUCKET_RENDERED", "artifacts-rendered"),
		S3PublicURLBase: getenv("S3_PUBLIC_URL_BASE", "http://localhost:9000"),
		SMTPHost:        getenv("SMTP_HOST", "localhost"),
		SMTPPort:        getenv("SMTP_PORT", "1025"),
		SMTPFrom:        getenv("SMTP_FROM", "no-reply@halide-lab.org"),
		OIDCIssuer:      getenv("OIDC_ISSUER", "http://localhost:9100/default"),
		OIDCClientID:    getenv("OIDC_CLIENT_ID", "lab-app"),
		OIDCClientSecret: getenv("OIDC_CLIENT_SECRET", "lab-secret"),
		OIDCRedirectURL: getenv("OIDC_REDIRECT_URL", "http://localhost:5173/auth/callback"),
		JWTSigningKey:   getenv("JWT_SIGNING_KEY", "dev-insecure-jwt-key-change-me"),
		InviteSignKey:   getenv("INVITE_SIGN_KEY", "dev-insecure-invite-key-change-me"),
		AccessTokenTTL:  getdur("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTokenTTL: getdur("REFRESH_TOKEN_TTL", 720*time.Hour),
		CookieDomain:    getenv("COOKIE_DOMAIN", "localhost"),
		CookieSecure:    getbool("COOKIE_SECURE", false),
		WebOrigin:       getenv("WEB_ORIGIN", "http://localhost:5173"),
		NBConvertURL:    getenv("NBCONVERT_URL", "http://localhost:8090"),
		SearxNGURL:      getenv("SEARXNG_URL", "http://localhost:8888"),
	}
	c.AllowedEmailDomains = splitCSV(getenv("ALLOWED_EMAIL_DOMAINS", "halide-lab.org"))

	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	return c, nil
}

func (c *Config) IsProduction() bool { return c.Env == "production" }

func getenv(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func getbool(key string, def bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return def
}

func getdur(key string, def time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		d, err := time.ParseDuration(v)
		if err == nil {
			return d
		}
	}
	return def
}

func splitCSV(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == ',' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		if r == ' ' {
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
