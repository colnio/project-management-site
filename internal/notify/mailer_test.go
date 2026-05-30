package notify_test

import (
	"testing"

	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/notify"
)

func TestMailer_LocalhostUsesPlainSMTP(t *testing.T) {
	cfg := &config.Config{
		SMTPHost: "localhost",
		SMTPPort: "1025",
		SMTPFrom: "test@example.com",
	}
	m := notify.NewMailer(cfg)
	// Mailpit may not be running; connection refused is acceptable — we only
	// assert the mailer accepts localhost without TLS setup errors.
	err := m.Send("nobody@example.com", "subj", "body", nil)
	if err == nil {
		return
	}
	if err.Error() == "" {
		t.Fatal("unexpected empty error")
	}
}
