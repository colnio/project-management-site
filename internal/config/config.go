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
	S3Endpoint      string
	S3Region        string
	S3AccessKey     string
	S3SecretKey     string
	S3UsePathStyle  bool
	BucketOriginals string
	BucketRendered  string
	S3PublicURLBase string // base URL the browser uses to reach object storage

	// Email (Mailpit locally, SES in prod) — standard SMTP.
	SMTPHost     string
	SMTPPort     string
	SMTPFrom     string
	SMTPUser     string
	SMTPPassword string

	// Daily digest schedule (local wall-clock hour in LabTimezone).
	DigestHour  int
	LabTimezone string

	// AIChatIdleTTLDays is the number of days of no access (neither opened nor
	// messaged) after which an AI chat conversation is hard-deleted.
	AIChatIdleTTLDays int

	// Auth signing + cookies.
	JWTSigningKey   string
	InviteSignKey   string
	DigestSignKey   string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	CookieDomain    string
	CookieSecure    bool

	// Allow-listed email domains for SSO sign-in (comma-separated in env).
	AllowedEmailDomains []string

	// Frontend origin for CORS / redirects.
	WebOrigin string

	// nbconvert sidecar.
	NBConvertURL string

	// SearXNG (agent web search). Kept here so config stays in one place even
	// though the LLM track is not yet built.
	SearxNGURL string

	// Brave Web Search API key — powers the agent's web_search tool. Empty
	// disables web search (the tool returns an "unconfigured" message).
	BraveSearchAPIKey string
}

// Load reads configuration from the environment. Missing required values for
// the selected environment cause an error.
func Load() (*Config, error) {
	c := &Config{
		Env:               getenv("APP_ENV", "development"),
		Port:              getenv("PORT", "8080"),
		DatabaseURL:       getenv("DATABASE_URL", "postgres://lab:lab@localhost:5432/lab?sslmode=disable"),
		S3Endpoint:        getenv("S3_ENDPOINT", "http://localhost:9000"),
		S3Region:          getenv("S3_REGION", "us-east-1"),
		S3AccessKey:       getenv("S3_ACCESS_KEY", "minioadmin"),
		S3SecretKey:       getenv("S3_SECRET_KEY", "minioadmin"),
		S3UsePathStyle:    getbool("S3_USE_PATH_STYLE", true),
		BucketOriginals:   getenv("S3_BUCKET_ORIGINALS", "artifacts-originals"),
		BucketRendered:    getenv("S3_BUCKET_RENDERED", "artifacts-rendered"),
		S3PublicURLBase:   getenv("S3_PUBLIC_URL_BASE", "http://localhost:9000"),
		SMTPHost:          getenv("SMTP_HOST", "localhost"),
		SMTPPort:          getenv("SMTP_PORT", "1025"),
		SMTPFrom:          getenv("SMTP_FROM", "no-reply@graphene-lab.org"),
		SMTPUser:          getenv("SMTP_USER", ""),
		SMTPPassword:      getenv("SMTP_PASSWORD", ""),
		DigestHour:        getint("DIGEST_HOUR", 7),
		LabTimezone:       getenv("LAB_TIMEZONE", "Asia/Singapore"),
		AIChatIdleTTLDays: getint("AI_CHAT_IDLE_TTL_DAYS", 30),
		JWTSigningKey:     getenv("JWT_SIGNING_KEY", defaultJWTSigningKey),
		InviteSignKey:     getenv("INVITE_SIGN_KEY", defaultInviteSignKey),
		DigestSignKey:     getenv("DIGEST_SIGN_KEY", defaultDigestSignKey),
		AccessTokenTTL:    getdur("ACCESS_TOKEN_TTL", 60*time.Minute),
		RefreshTokenTTL:   getdur("REFRESH_TOKEN_TTL", 720*time.Hour),
		CookieDomain:      getenv("COOKIE_DOMAIN", "localhost"),
		CookieSecure:      getbool("COOKIE_SECURE", false),
		WebOrigin:         getenv("WEB_ORIGIN", "http://localhost:5173"),
		NBConvertURL:      getenv("NBCONVERT_URL", "http://localhost:8090"),
		SearxNGURL:        getenv("SEARXNG_URL", "http://localhost:8888"),
		BraveSearchAPIKey: getenv("BRAVE_SEARCH_API_KEY", ""),
	}
	c.AllowedEmailDomains = splitCSV(getenv("ALLOWED_EMAIL_DOMAINS", "nus.edu.sg,u.nus.edu"))

	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if err := c.validateProduction(); err != nil {
		return nil, err
	}
	// In production keep access tokens alive long enough that a single racing
	// refresh can't bounce an active user mid-session. Floor at 24h regardless
	// of the configured ACCESS_TOKEN_TTL. Dev keeps the shorter default.
	if c.IsProduction() && c.AccessTokenTTL < 24*time.Hour {
		c.AccessTokenTTL = 24 * time.Hour
	}
	return c, nil
}

const (
	defaultJWTSigningKey = "dev-insecure-jwt-key-change-me"
	defaultInviteSignKey = "dev-insecure-invite-key-change-me"
	defaultDigestSignKey = "dev-insecure-digest-key-change-me"
	minSigningKeyBytes   = 32
)

func (c *Config) validateProduction() error {
	if !c.IsProduction() {
		return nil
	}
	if len(c.JWTSigningKey) < minSigningKeyBytes || c.JWTSigningKey == defaultJWTSigningKey {
		return fmt.Errorf("production requires JWT_SIGNING_KEY of at least %d bytes (not the dev default)", minSigningKeyBytes)
	}
	if len(c.InviteSignKey) < minSigningKeyBytes || c.InviteSignKey == defaultInviteSignKey {
		return fmt.Errorf("production requires INVITE_SIGN_KEY of at least %d bytes (not the dev default)", minSigningKeyBytes)
	}
	if len(c.DigestSignKey) < minSigningKeyBytes || c.DigestSignKey == defaultDigestSignKey {
		return fmt.Errorf("production requires DIGEST_SIGN_KEY of at least %d bytes (not the dev default)", minSigningKeyBytes)
	}
	if !c.CookieSecure {
		return fmt.Errorf("production requires COOKIE_SECURE=true")
	}
	if c.S3AccessKey == "minioadmin" || c.S3SecretKey == "minioadmin" {
		return fmt.Errorf("production must not use default MinIO credentials for S3")
	}
	return nil
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

func getint(key string, def int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
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
