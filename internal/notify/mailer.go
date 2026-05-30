package notify

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

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

	if smtpHostIsLocal(m.cfg.SMTPHost) {
		return smtp.SendMail(addr, auth, from, []string{to}, msg)
	}
	return sendSMTPWithTLS(addr, m.cfg.SMTPHost, m.cfg.SMTPPort, auth, from, []string{to}, msg)
}

func smtpHostIsLocal(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	return h == "localhost" || h == "127.0.0.1" || h == "::1"
}

func sendSMTPWithTLS(addr, host, port string, auth smtp.Auth, from string, to []string, msg []byte) error {
	tlsCfg := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}

	if port == "465" {
		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 15 * time.Second}, "tcp", addr, tlsCfg)
		if err != nil {
			return fmt.Errorf("smtp tls dial: %w", err)
		}
		defer conn.Close()
		return smtpOnConn(conn, host, auth, from, to, msg)
	}

	conn, err := net.DialTimeout("tcp", addr, 15*time.Second)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	defer conn.Close()

	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer c.Close()

	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	} else {
		return fmt.Errorf("smtp: STARTTLS required for non-localhost %s", host)
	}
	return deliver(c, auth, from, to, msg)
}

func smtpOnConn(conn net.Conn, host string, auth smtp.Auth, from string, to []string, msg []byte) error {
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer c.Close()
	return deliver(c, auth, from, to, msg)
}

func deliver(c *smtp.Client, auth smtp.Auth, from string, to []string, msg []byte) error {
	if auth != nil {
		if ok, _ := c.Extension("AUTH"); ok {
			if err := c.Auth(auth); err != nil {
				return fmt.Errorf("smtp auth: %w", err)
			}
		}
	}
	if err := c.Mail(from); err != nil {
		return err
	}
	for _, rcpt := range to {
		if err := c.Rcpt(rcpt); err != nil {
			return err
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}
