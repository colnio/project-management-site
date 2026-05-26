package org

import (
	"fmt"
	"net/smtp"
)

// sendInviteEmail sends a workspace invite link to the given address.
// It uses plain unauthenticated SMTP (Mailpit locally, configured elsewhere).
// If sending fails the caller logs a warning but continues — email delivery
// is best-effort for the invite flow.
func (s *Service) sendInviteEmail(to, link string) error {
	addr := fmt.Sprintf("%s:%s", s.cfg.SMTPHost, s.cfg.SMTPPort)
	from := s.cfg.SMTPFrom

	msg := []byte(
		"From: " + from + "\r\n" +
			"To: " + to + "\r\n" +
			"Subject: You have been invited to a workspace\r\n" +
			"Content-Type: text/plain; charset=utf-8\r\n" +
			"\r\n" +
			"You have been invited to join a workspace.\r\n\r\n" +
			"Accept your invitation here:\r\n" +
			link + "\r\n\r\n" +
			"This link expires in 7 days.\r\n",
	)

	return smtp.SendMail(addr, nil, from, []string{to}, msg)
}
