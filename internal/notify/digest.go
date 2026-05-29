package notify

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	"github.com/colnio/project-management-site/internal/inbox"
)

// runDailyDigest builds and enqueues one digest email per eligible user.
func (s *Service) runDailyDigest(ctx context.Context) error {
	if s.inbox == nil || s.authSvc == nil {
		return fmt.Errorf("notify: digest dependencies not configured")
	}

	rows, err := s.pool.Query(ctx,
		`SELECT u.id, u.email FROM users u
		 WHERE u.status = 'approved'`,
	)
	if err != nil {
		return fmt.Errorf("notify: list users for digest: %w", err)
	}
	defer rows.Close()

	dateStr := time.Now().UTC().Format("2006-01-02")
	for rows.Next() {
		var userID uuid.UUID
		var email string
		if err := rows.Scan(&userID, &email); err != nil {
			return err
		}
		if err := s.enqueueDigestForUser(ctx, userID, email, dateStr); err != nil {
			s.log.Warn("notify: digest for user failed", "user_id", userID, "err", err)
		}
	}
	return rows.Err()
}

func (s *Service) enqueueDigestForUser(ctx context.Context, userID uuid.UUID, email, dateStr string) error {
	enabled, err := s.isCategoryEnabled(ctx, userID, CategoryDigest)
	if err != nil {
		return err
	}
	if !enabled {
		return nil
	}

	// One digest per user per calendar day (UTC).
	idemKey := fmt.Sprintf("digest:%s:%s", userID, dateStr)
	var exists bool
	err = s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM email_outbox WHERE idempotency_key = $1)`,
		idemKey,
	).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	since, err := s.digestWatermark(ctx, userID)
	if err != nil {
		return err
	}

	wsRows, err := s.pool.Query(ctx,
		`SELECT workspace_id FROM workspace_memberships WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return err
	}
	defer wsRows.Close()

	var sections []string
	for wsRows.Next() {
		var wsID uuid.UUID
		if err := wsRows.Scan(&wsID); err != nil {
			return err
		}
		items, err := s.inbox.AggregateForWorkspace(ctx, wsID)
		if err != nil {
			return err
		}
		var fresh []inbox.Item
		for _, it := range items {
			if it.CreatedAt.After(since) {
				fresh = append(fresh, it)
			}
		}
		items = fresh
		if len(items) == 0 {
			continue
		}
		var b strings.Builder
		b.WriteString("Workspace ")
		b.WriteString(wsID.String()[:8])
		b.WriteString(":\n")
		limit := len(items)
		if limit > 10 {
			limit = 10
		}
		for i := 0; i < limit; i++ {
			it := items[i]
			b.WriteString("  • ")
			b.WriteString(it.Title)
			if it.Link != "" {
				b.WriteString(" — ")
				b.WriteString(absURL(s.cfg.WebOrigin, it.Link))
			}
			b.WriteByte('\n')
		}
		if len(items) > limit {
			b.WriteString(fmt.Sprintf("  … and %d more\n", len(items)-limit))
		}
		sections = append(sections, b.String())
	}
	if err := wsRows.Err(); err != nil {
		return err
	}
	if len(sections) == 0 {
		return nil
	}

	body := strings.Join(sections, "\n")
	uid := userID
	if err := s.Enqueue(ctx, EnqueueParams{
		UserID:         &uid,
		ToEmail:        email,
		Category:       CategoryDigest,
		TemplateKey:    TemplateDailyDigest,
		IdempotencyKey: idemKey,
		Payload: map[string]any{
			"Date":            dateStr,
			"Body":            body,
			"ActionPath":      "/inbox",
			"UnsubscribeURL":  s.DigestUnsubscribeURL(userID),
		},
	}); err != nil {
		return err
	}
	return s.setDigestWatermark(ctx, userID, time.Now().UTC())
}

func (s *Service) digestWatermark(ctx context.Context, userID uuid.UUID) (time.Time, error) {
	var since time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT last_sent_at FROM email_digest_watermarks WHERE user_id = $1`,
		userID,
	).Scan(&since)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return time.Time{}, nil
		}
		return time.Time{}, fmt.Errorf("notify: read digest watermark: %w", err)
	}
	return since, nil
}

func (s *Service) setDigestWatermark(ctx context.Context, userID uuid.UUID, at time.Time) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO email_digest_watermarks (user_id, last_sent_at)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at`,
		userID, at,
	)
	if err != nil {
		return fmt.Errorf("notify: set digest watermark: %w", err)
	}
	return nil
}

// UnsubscribeDigest disables digest emails for the user in the token.
func (s *Service) UnsubscribeDigest(ctx context.Context, token string) error {
	userID, err := verifyDigestToken(s.cfg.InviteSignKey, token)
	if err != nil {
		return err
	}
	return s.UpdatePreferences(ctx, userID, map[string]bool{CategoryDigest: false})
}

// dailyAtSchedule runs once per day at a fixed local hour.
type dailyAtSchedule struct {
	hour   int
	minute int
	loc    *time.Location
}

func (d *dailyAtSchedule) Next(t time.Time) time.Time {
	t = t.In(d.loc)
	next := time.Date(t.Year(), t.Month(), t.Day(), d.hour, d.minute, 0, 0, d.loc)
	if !next.After(t) {
		next = next.Add(24 * time.Hour)
	}
	return next
}

// NewDailyDigestPeriodicJob returns a River periodic job for digest fan-out.
func NewDailyDigestPeriodicJob(hour int, loc *time.Location) *river.PeriodicJob {
	if loc == nil {
		loc = time.UTC
	}
	return river.NewPeriodicJob(
		&dailyAtSchedule{hour: hour, minute: 0, loc: loc},
		func() (river.JobArgs, *river.InsertOpts) {
			return BuildDigestArgs{}, nil
		},
		&river.PeriodicJobOpts{RunOnStart: false},
	)
}
