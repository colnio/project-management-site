package notify

import (
	"fmt"
	"net/smtp"
	"strings"

	"github.com/colnio/project-management-site/internal/config"
)

// Mailer sends plain-text email via SMTP.
type Mailer struct {
	cfg *config.Config
}

// NewMailer constructs a Mailer.
func NewMailer(cfg *config.Config) *Mailer {
	return &Mailer{cfg: cfg}
}

// Send delivers a single plain-text message.
func (m *Mailer) Send(to, subject, body string, extraHeaders map[string]string) error {
	addr := fmt.Sprintf("%s:%s", m.cfg.SMTPHost, m.cfg.SMTPPort)
	from := m.cfg.SMTPFrom

	var hdr strings.Builder
	hdr.WriteString("From: ")
	hdr.WriteString(from)
	hdr.WriteString("\r\nTo: ")
	hdr.WriteString(to)
	hdr.WriteString("\r\nSubject: ")
	hdr.WriteString(subject)
	hdr.WriteString("\r\nContent-Type: text/plain; charset=utf-8\r\n")
	for k, v := range extraHeaders {
		hdr.WriteString(k)
		hdr.WriteString(": ")
		hdr.WriteString(v)
		hdr.WriteString("\r\n")
	}
	hdr.WriteString("\r\n")
	hdr.WriteString(body)

	msg := []byte(hdr.String())

	var auth smtp.Auth
	if m.cfg.SMTPUser != "" && m.cfg.SMTPPassword != "" {
		auth = smtp.PlainAuth("", m.cfg.SMTPUser, m.cfg.SMTPPassword, m.cfg.SMTPHost)
	}
	return smtp.SendMail(addr, auth, from, []string{to}, msg)
}
