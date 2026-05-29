package notify_test

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/notify"
	"github.com/colnio/project-management-site/internal/testsupport"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func TestMandatoryCategoryCannotDisable(t *testing.T) {
	pool := testsupport.NewPool(t)
	cfg := &config.Config{WebOrigin: "http://localhost:5173", InviteSignKey: "test-key"}
	svc := notify.NewService(pool, cfg, audit.Nop{}, testLogger())

	userID := seedUser(t, pool, "mandatory-"+uuid.NewString()+"@graphene-lab.org")

	err := svc.UpdatePreferences(context.Background(), userID, map[string]bool{notify.CategoryAccount: false})
	if err == nil {
		t.Fatal("expected error disabling mandatory category")
	}
}

func TestShouldSendRespectsPreference(t *testing.T) {
	pool := testsupport.NewPool(t)
	cfg := &config.Config{WebOrigin: "http://localhost:5173", InviteSignKey: "test-key"}
	svc := notify.NewService(pool, cfg, audit.Nop{}, testLogger())

	userID := seedUser(t, pool, "prefs-"+uuid.NewString()+"@graphene-lab.org")
	if err := svc.UpdatePreferences(context.Background(), userID, map[string]bool{notify.CategoryDigest: false}); err != nil {
		t.Fatalf("UpdatePreferences: %v", err)
	}

	items, err := svc.ListPreferences(context.Background(), userID)
	if err != nil {
		t.Fatalf("ListPreferences: %v", err)
	}
	for _, it := range items {
		if it.Category == notify.CategoryDigest && it.Enabled {
			t.Fatal("expected digest disabled")
		}
	}
}

func TestRenderWorkspaceInviteTemplate(t *testing.T) {
	pool := testsupport.NewPool(t)
	cfg := &config.Config{
		WebOrigin:     "http://localhost:5173",
		InviteSignKey: "test-key",
		SMTPHost:      "localhost",
		SMTPPort:      "1025",
		SMTPFrom:      "test@example.com",
	}
	svc := notify.NewService(pool, cfg, audit.Nop{}, testLogger())

	id := uuid.New()
	err := svc.Enqueue(context.Background(), notify.EnqueueParams{
		ToEmail:        "invite@example.com",
		Category:       notify.CategorySecurity,
		TemplateKey:    notify.TemplateWorkspaceInvite,
		IdempotencyKey: "invite:" + id.String(),
		Payload: map[string]any{
			"InviteLink": "http://localhost:5173/invite/accept?token=abc",
			"PrefsURL":   "http://localhost:5173/settings",
		},
	})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
}

func TestDigestTokenRoundTrip(t *testing.T) {
	id := uuid.New()
	token := notify.ExportSignDigestToken("secret", id)
	parsed, err := notify.ExportVerifyDigestToken("secret", token)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if parsed != id {
		t.Fatalf("got %v want %v", parsed, id)
	}
}

func seedUser(t *testing.T, pool *pgxpool.Pool, email string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO users (id, email, display_name, global_role, status)
		 VALUES ($1, $2, $3, 'member', 'approved')`,
		id, email, "Test User",
	)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return id
}
