package config_test

import (
	"os"
	"strings"
	"testing"

	"github.com/colnio/project-management-site/internal/config"
)

func TestLoadProductionRejectsDefaultDigestKey(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SIGNING_KEY", strings.Repeat("a", 32))
	t.Setenv("INVITE_SIGN_KEY", strings.Repeat("b", 32))
	t.Setenv("DIGEST_SIGN_KEY", "dev-insecure-digest-key-change-me")
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("S3_ACCESS_KEY", "real-key")
	t.Setenv("S3_SECRET_KEY", "real-secret")

	_, err := config.Load()
	if err == nil {
		t.Fatal("expected production load to reject default digest signing key")
	}
}

func TestLoadProductionRejectsInsecureDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SIGNING_KEY", "dev-insecure-jwt-key-change-me")
	t.Setenv("INVITE_SIGN_KEY", strings.Repeat("x", 32))
	t.Setenv("DIGEST_SIGN_KEY", strings.Repeat("y", 32))
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("S3_ACCESS_KEY", "real-key")
	t.Setenv("S3_SECRET_KEY", "real-secret")

	_, err := config.Load()
	if err == nil {
		t.Fatal("expected production load to reject default JWT signing key")
	}
}

func TestLoadProductionAcceptsStrongConfig(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SIGNING_KEY", strings.Repeat("a", 32))
	t.Setenv("INVITE_SIGN_KEY", strings.Repeat("b", 32))
	t.Setenv("DIGEST_SIGN_KEY", strings.Repeat("c", 32))
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("S3_ACCESS_KEY", "real-key")
	t.Setenv("S3_SECRET_KEY", "real-secret")
	t.Setenv("DATABASE_URL", os.Getenv("DATABASE_URL"))

	if os.Getenv("DATABASE_URL") == "" {
		t.Setenv("DATABASE_URL", "postgres://lab:lab@localhost:5432/lab?sslmode=disable")
	}

	c, err := config.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !c.IsProduction() {
		t.Fatal("expected production env")
	}
}
