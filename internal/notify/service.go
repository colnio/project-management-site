// Package notify owns email outbox delivery, user notification preferences,
// daily digests, and admin broadcasts.
package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/inbox"
	"github.com/colnio/project-management-site/internal/platform"
)

// EnqueueParams describes a transactional email to queue.
type EnqueueParams struct {
	UserID         *uuid.UUID
	ToEmail        string
	Category       string
	TemplateKey    string
	IdempotencyKey string
	Payload        map[string]any
}

// Service is the notify module domain service.
type Service struct {
	pool    *pgxpool.Pool
	cfg     *config.Config
	rec     audit.Recorder
	mailer  *Mailer
	log     *slog.Logger
	enq     Enqueuer
	inbox   *inbox.Service
	authSvc *auth.Service
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool, cfg *config.Config, rec audit.Recorder, log *slog.Logger) *Service {
	return &Service{
		pool:   pool,
		cfg:    cfg,
		rec:    rec,
		mailer: NewMailer(cfg),
		log:    log,
	}
}

// SetEnqueuer wires River job insertion (call from main after River starts).
func (s *Service) SetEnqueuer(e Enqueuer) {
	s.enq = e
}

// SetInbox wires the inbox aggregator for daily digests.
func (s *Service) SetInbox(inboxSvc *inbox.Service) {
	s.inbox = inboxSvc
}

// SetAuth wires auth for user lookups during digest/broadcast.
func (s *Service) SetAuth(authSvc *auth.Service) {
	s.authSvc = authSvc
}

// Enqueue records an outbox row and schedules delivery. Best-effort: errors are logged
// and do not propagate to callers of domain mutations.
func (s *Service) Enqueue(ctx context.Context, p EnqueueParams) error {
	if p.ToEmail == "" {
		return nil
	}
	if p.IdempotencyKey == "" {
		return fmt.Errorf("notify: idempotency key required")
	}

	send, err := s.shouldSend(ctx, p.UserID, p.Category)
	if err != nil {
		return err
	}
	if !send {
		s.log.Debug("notify: skipped by preference", "category", p.Category, "to", p.ToEmail)
		return nil
	}

	payloadJSON, err := json.Marshal(p.Payload)
	if err != nil {
		return fmt.Errorf("notify: marshal payload: %w", err)
	}

	var outboxID uuid.UUID
	err = s.pool.QueryRow(ctx,
		`INSERT INTO email_outbox (user_id, to_email, category, template_key, payload, idempotency_key)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (idempotency_key) DO NOTHING
		 RETURNING id`,
		p.UserID, p.ToEmail, p.Category, p.TemplateKey, payloadJSON, p.IdempotencyKey,
	).Scan(&outboxID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // duplicate idempotency key
		}
		return fmt.Errorf("notify: insert outbox: %w", err)
	}

	if s.enq == nil {
		s.log.Warn("notify: enqueuer not configured; email left pending", "outbox_id", outboxID)
		return nil
	}
	return s.enq.EnqueueSendEmail(ctx, outboxID)
}

func (s *Service) shouldSend(ctx context.Context, userID *uuid.UUID, category string) (bool, error) {
	if isMandatory(category) {
		return true, nil
	}
	if userID == nil {
		// Pre-registration recipients (invites) always receive email.
		return true, nil
	}
	enabled, err := s.isCategoryEnabled(ctx, *userID, category)
	if err != nil {
		return false, err
	}
	return enabled, nil
}

func (s *Service) isCategoryEnabled(ctx context.Context, userID uuid.UUID, category string) (bool, error) {
	var enabled bool
	err := s.pool.QueryRow(ctx,
		`SELECT enabled FROM user_notification_prefs
		 WHERE user_id = $1 AND channel = 'email' AND category = $2`,
		userID, category,
	).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if def, ok := defaultEnabled[category]; ok {
				return def, nil
			}
			return true, nil
		}
		return false, fmt.Errorf("notify: read pref: %w", err)
	}
	return enabled, nil
}

// PreferenceItem is one notification category for the settings API.
type PreferenceItem struct {
	Category    string `json:"category"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	Mandatory   bool   `json:"mandatory"`
}

// ListPreferences returns all UI categories with effective enabled state.
func (s *Service) ListPreferences(ctx context.Context, userID uuid.UUID) ([]PreferenceItem, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT category, enabled FROM user_notification_prefs
		 WHERE user_id = $1 AND channel = 'email'`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("notify: list prefs: %w", err)
	}
	defer rows.Close()
	stored := make(map[string]bool)
	for rows.Next() {
		var cat string
		var en bool
		if err := rows.Scan(&cat, &en); err != nil {
			return nil, err
		}
		stored[cat] = en
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]PreferenceItem, 0, len(AllPreferenceCategories()))
	for _, def := range AllPreferenceCategories() {
		enabled := defaultEnabled[def.Key]
		if v, ok := stored[def.Key]; ok {
			enabled = v
		}
		if isMandatory(def.Key) {
			enabled = true
		}
		out = append(out, PreferenceItem{
			Category:    def.Key,
			Label:       def.Label,
			Description: def.Description,
			Enabled:     enabled,
			Mandatory:   isMandatory(def.Key),
		})
	}
	return out, nil
}

// UpdatePreferences applies toggles; mandatory categories cannot be disabled.
func (s *Service) UpdatePreferences(ctx context.Context, userID uuid.UUID, updates map[string]bool) error {
	for cat, enabled := range updates {
		if isMandatory(cat) && !enabled {
			return platform.BadRequest("notify.mandatory_category", "cannot disable mandatory category: "+cat)
		}
		_, err := s.pool.Exec(ctx,
			`INSERT INTO user_notification_prefs (user_id, channel, category, enabled, updated_at)
			 VALUES ($1, 'email', $2, $3, now())
			 ON CONFLICT (user_id, channel, category)
			 DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
			userID, cat, enabled,
		)
		if err != nil {
			return fmt.Errorf("notify: upsert pref: %w", err)
		}
	}
	return nil
}

func (s *Service) prefsURL() string {
	return absURL(s.cfg.WebOrigin, "/settings")
}

// loadOutboxRow loads a pending/sent row for the worker.
func (s *Service) loadOutboxRow(ctx context.Context, id uuid.UUID) (outboxRow, error) {
	var row outboxRow
	var payloadJSON []byte
	var userID *uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, to_email, category, template_key, payload, status
		 FROM email_outbox WHERE id = $1`,
		id,
	).Scan(&row.ID, &userID, &row.ToEmail, &row.Category, &row.TemplateKey, &payloadJSON, &row.Status)
	if err != nil {
		return outboxRow{}, err
	}
	row.UserID = userID
	if err := json.Unmarshal(payloadJSON, &row.Payload); err != nil {
		return outboxRow{}, err
	}
	return row, nil
}

type outboxRow struct {
	ID          uuid.UUID
	UserID      *uuid.UUID
	ToEmail     string
	Category    string
	TemplateKey string
	Payload     map[string]any
	Status      string
}

func (s *Service) markOutbox(ctx context.Context, id uuid.UUID, status, lastErr string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE email_outbox SET status = $2, last_error = $3,
		 sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
		 WHERE id = $1`,
		id, status, lastErr,
	)
	return err
}

// deliverOutbox renders and sends one outbox row.
func (s *Service) deliverOutbox(ctx context.Context, id uuid.UUID) error {
	row, err := s.loadOutboxRow(ctx, id)
	if err != nil {
		return err
	}
	if row.Status == "sent" || row.Status == "skipped" {
		return nil
	}

	// Re-check preferences at send time for non-mandatory categories.
	if row.UserID != nil && !isMandatory(row.Category) {
		ok, err := s.isCategoryEnabled(ctx, *row.UserID, row.Category)
		if err != nil {
			return err
		}
		if !ok {
			return s.markOutbox(ctx, id, "skipped", "disabled by user preference")
		}
	}

	data := make(map[string]any, len(row.Payload)+2)
	for k, v := range row.Payload {
		data[k] = v
	}
	if _, ok := data["PrefsURL"]; !ok {
		data["PrefsURL"] = s.prefsURL()
	}
	if path, ok := data["ActionPath"].(string); ok {
		data["ActionURL"] = absURL(s.cfg.WebOrigin, path)
	}

	rendered, err := renderTemplate(row.TemplateKey, data)
	if err != nil {
		_ = s.markOutbox(ctx, id, "failed", err.Error())
		return err
	}

	headers := map[string]string{}
	if row.UserID != nil && !isMandatory(row.Category) {
		headers["List-Unsubscribe"] = "<" + s.prefsURL() + ">"
	}

	if err := s.mailer.Send(row.ToEmail, rendered.Subject, rendered.Body, headers); err != nil {
		_ = s.markOutbox(ctx, id, "failed", err.Error())
		return err
	}
	return s.markOutbox(ctx, id, "sent", "")
}

// DigestUnsubscribeToken signs a one-click digest opt-out URL.
func (s *Service) DigestUnsubscribeURL(userID uuid.UUID) string {
	token := signDigestToken(s.cfg.DigestSignKey, userID)
	return absURL(s.cfg.WebOrigin, "/v1/notify/digest/unsubscribe?token="+token)
}
