// Package calendar implements the Calendar module (E1+E2): project event CRUD,
// per-user iCalendar feed subscriptions, and RFC 5545-compliant .ics output.
// It depends on the project module for authorization and the audit module for
// recording mutations. All access is gated through project.Authorize.
package calendar

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// Event is the core domain struct for a project calendar event.
type Event struct {
	ID             uuid.UUID  `json:"id"`
	ProjectID      uuid.UUID  `json:"project_id"`
	IterationID    *uuid.UUID `json:"iteration_id,omitempty"`
	SampleID       *uuid.UUID `json:"sample_id,omitempty"`
	ExperimentID   *uuid.UUID `json:"experiment_id,omitempty"`
	Kind           string     `json:"kind"`
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	StartAt        time.Time  `json:"start_at"`
	EndAt          *time.Time `json:"end_at,omitempty"`
	AllDay         bool       `json:"all_day"`
	RecurrenceRule string     `json:"recurrence_rule,omitempty"`
	CreatedBy      uuid.UUID  `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// Subscription is the per-user iCalendar feed subscription.
type Subscription struct {
	ID            uuid.UUID  `json:"id"`
	UserID        uuid.UUID  `json:"user_id"`
	Token         string     `json:"token"`
	Scope         string     `json:"scope"`
	ProjectIDs    []uuid.UUID `json:"project_ids"`
	RevokedAt     *time.Time `json:"revoked_at,omitempty"`
	LastFetchedAt *time.Time `json:"last_fetched_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// Service is the calendar module's domain service.
type Service struct {
	pool     *pgxpool.Pool
	projects *project.Service
	rec      audit.Recorder
	log      *slog.Logger
}

// NewService constructs a Service.
func NewService(
	pool *pgxpool.Pool,
	projects *project.Service,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:     pool,
		projects: projects,
		rec:      rec,
		log:      log,
	}
}

// ─── Event domain methods ─────────────────────────────────────────────────────

// GetEvent loads a calendar event by id. Returns platform.NotFound if absent.
func (s *Service) GetEvent(ctx context.Context, id uuid.UUID) (*Event, error) {
	var e Event
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, iteration_id, sample_id, experiment_id,
		        kind, title, description, start_at, end_at, all_day, recurrence_rule,
		        created_by, created_at, updated_at
		 FROM project_events WHERE id = $1`,
		id,
	).Scan(
		&e.ID, &e.ProjectID, &e.IterationID, &e.SampleID, &e.ExperimentID,
		&e.Kind, &e.Title, &e.Description, &e.StartAt, &e.EndAt, &e.AllDay, &e.RecurrenceRule,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("event.not_found", "event not found")
	}
	if err != nil {
		return nil, fmt.Errorf("calendar: get event: %w", err)
	}
	return &e, nil
}

// CreateEvent inserts a new project event. Caller must already be authorized.
func (s *Service) CreateEvent(
	ctx context.Context,
	projectID uuid.UUID,
	kind, title, description string,
	startAt time.Time,
	endAt *time.Time,
	allDay bool,
	recurrenceRule string,
	iterationID, sampleID, experimentID *uuid.UUID,
	creatorID uuid.UUID,
) (*Event, error) {
	if kind == "" {
		kind = "custom"
	}
	var e Event
	err := s.pool.QueryRow(ctx,
		`INSERT INTO project_events
		   (project_id, iteration_id, sample_id, experiment_id,
		    kind, title, description, start_at, end_at, all_day, recurrence_rule, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		 RETURNING id, project_id, iteration_id, sample_id, experiment_id,
		           kind, title, description, start_at, end_at, all_day, recurrence_rule,
		           created_by, created_at, updated_at`,
		projectID, iterationID, sampleID, experimentID,
		kind, title, description, startAt, endAt, allDay, recurrenceRule, creatorID,
	).Scan(
		&e.ID, &e.ProjectID, &e.IterationID, &e.SampleID, &e.ExperimentID,
		&e.Kind, &e.Title, &e.Description, &e.StartAt, &e.EndAt, &e.AllDay, &e.RecurrenceRule,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("calendar: create event: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        creatorID,
		Action:       "event.create",
		ResourceType: "event",
		ResourceID:   e.ID.String(),
	})

	return &e, nil
}

// ListEvents returns events for a project, optionally filtered by start_at range.
func (s *Service) ListEvents(ctx context.Context, projectID uuid.UUID, from, to *time.Time) ([]*Event, error) {
	query := `SELECT id, project_id, iteration_id, sample_id, experiment_id,
	                 kind, title, description, start_at, end_at, all_day, recurrence_rule,
	                 created_by, created_at, updated_at
	          FROM project_events
	          WHERE project_id = $1`
	args := []any{projectID}

	if from != nil {
		args = append(args, *from)
		query += fmt.Sprintf(" AND start_at >= $%d", len(args))
	}
	if to != nil {
		args = append(args, *to)
		query += fmt.Sprintf(" AND start_at <= $%d", len(args))
	}
	query += " ORDER BY start_at ASC"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("calendar: list events: %w", err)
	}
	defer rows.Close()

	var result []*Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(
			&e.ID, &e.ProjectID, &e.IterationID, &e.SampleID, &e.ExperimentID,
			&e.Kind, &e.Title, &e.Description, &e.StartAt, &e.EndAt, &e.AllDay, &e.RecurrenceRule,
			&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("calendar: scan event: %w", err)
		}
		result = append(result, &e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("calendar: rows error: %w", err)
	}
	return result, nil
}

// UpdateEvent applies partial updates (non-nil fields only).
func (s *Service) UpdateEvent(
	ctx context.Context,
	id uuid.UUID,
	kind, title, description *string,
	startAt *time.Time,
	endAt **time.Time,
	allDay *bool,
	recurrenceRule *string,
	iterationID, sampleID, experimentID **uuid.UUID,
	actorID uuid.UUID,
) (*Event, error) {
	// Build a dynamic update. We always set updated_at.
	// For simplicity, use CASE expressions for each field.
	var e Event
	err := s.pool.QueryRow(ctx,
		`UPDATE project_events
		 SET kind            = CASE WHEN $2::text IS NOT NULL AND $2 != '' THEN $2 ELSE kind END,
		     title           = CASE WHEN $3::text IS NOT NULL AND $3 != '' THEN $3 ELSE title END,
		     description     = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE description END,
		     start_at        = CASE WHEN $5::timestamptz IS NOT NULL THEN $5 ELSE start_at END,
		     end_at          = CASE WHEN $6::timestamptz IS NOT NULL THEN $6 ELSE end_at END,
		     all_day         = CASE WHEN $7::boolean IS NOT NULL THEN $7 ELSE all_day END,
		     recurrence_rule = CASE WHEN $8::text IS NOT NULL THEN $8 ELSE recurrence_rule END,
		     iteration_id    = CASE WHEN $9::uuid IS NOT NULL THEN $9 ELSE iteration_id END,
		     sample_id       = CASE WHEN $10::uuid IS NOT NULL THEN $10 ELSE sample_id END,
		     experiment_id   = CASE WHEN $11::uuid IS NOT NULL THEN $11 ELSE experiment_id END,
		     updated_at      = now()
		 WHERE id = $1
		 RETURNING id, project_id, iteration_id, sample_id, experiment_id,
		           kind, title, description, start_at, end_at, all_day, recurrence_rule,
		           created_by, created_at, updated_at`,
		id, kind, title, description, startAt, endAt, allDay, recurrenceRule,
		iterationID, sampleID, experimentID,
	).Scan(
		&e.ID, &e.ProjectID, &e.IterationID, &e.SampleID, &e.ExperimentID,
		&e.Kind, &e.Title, &e.Description, &e.StartAt, &e.EndAt, &e.AllDay, &e.RecurrenceRule,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("event.not_found", "event not found")
	}
	if err != nil {
		return nil, fmt.Errorf("calendar: update event: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "event.update",
		ResourceType: "event",
		ResourceID:   e.ID.String(),
	})

	return &e, nil
}

// DeleteEvent deletes an event by id.
func (s *Service) DeleteEvent(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM project_events WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("calendar: delete event: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("event.not_found", "event not found")
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "event.delete",
		ResourceType: "event",
		ResourceID:   id.String(),
	})

	return nil
}

// ─── Subscription domain methods ──────────────────────────────────────────────

// GetOrCreateSubscription lazily creates a subscription for the caller if one
// doesn't exist, returning the existing or newly created subscription.
func (s *Service) GetOrCreateSubscription(ctx context.Context, userID uuid.UUID) (*Subscription, error) {
	// Try to load existing.
	sub, err := s.getSubscriptionByUserID(ctx, userID)
	if err == nil {
		return sub, nil
	}
	// If it's not a not-found error, return the error.
	if sub == nil && err != nil {
		// Check if it's genuinely not found.
		notFoundErr, ok := err.(*platform.ErrorModel)
		if !ok || notFoundErr.GetStatus() != 404 {
			return nil, err
		}
	}

	// Create a new subscription.
	token, genErr := generateToken()
	if genErr != nil {
		return nil, fmt.Errorf("calendar: generate token: %w", genErr)
	}

	var newSub Subscription
	err = s.pool.QueryRow(ctx,
		`INSERT INTO calendar_subscriptions (user_id, token, scope, project_ids)
		 VALUES ($1, $2, 'all_visible_projects', '{}')
		 RETURNING id, user_id, token, scope, project_ids, revoked_at, last_fetched_at, created_at`,
		userID, token,
	).Scan(
		&newSub.ID, &newSub.UserID, &newSub.Token, &newSub.Scope,
		&newSub.ProjectIDs, &newSub.RevokedAt, &newSub.LastFetchedAt, &newSub.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("calendar: create subscription: %w", err)
	}
	if newSub.ProjectIDs == nil {
		newSub.ProjectIDs = []uuid.UUID{}
	}
	return &newSub, nil
}

// RotateToken generates a new token for the subscription, invalidating the old one.
func (s *Service) RotateToken(ctx context.Context, userID uuid.UUID) (*Subscription, error) {
	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("calendar: generate token: %w", err)
	}

	var sub Subscription
	err = s.pool.QueryRow(ctx,
		`UPDATE calendar_subscriptions
		 SET token = $2, revoked_at = NULL
		 WHERE user_id = $1
		 RETURNING id, user_id, token, scope, project_ids, revoked_at, last_fetched_at, created_at`,
		userID, token,
	).Scan(
		&sub.ID, &sub.UserID, &sub.Token, &sub.Scope,
		&sub.ProjectIDs, &sub.RevokedAt, &sub.LastFetchedAt, &sub.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("subscription.not_found", "subscription not found")
	}
	if err != nil {
		return nil, fmt.Errorf("calendar: rotate token: %w", err)
	}
	if sub.ProjectIDs == nil {
		sub.ProjectIDs = []uuid.UUID{}
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        userID,
		Action:       "calendar.rotate",
		ResourceType: "calendar_subscription",
		ResourceID:   sub.ID.String(),
	})

	return &sub, nil
}

// UpdateSubscription updates the scope and/or project_ids of a subscription.
func (s *Service) UpdateSubscription(ctx context.Context, userID uuid.UUID, scope *string, projectIDs *[]uuid.UUID) (*Subscription, error) {
	var sub Subscription
	err := s.pool.QueryRow(ctx,
		`UPDATE calendar_subscriptions
		 SET scope       = CASE WHEN $2::text IS NOT NULL AND $2 != '' THEN $2 ELSE scope END,
		     project_ids = CASE WHEN $3::uuid[] IS NOT NULL THEN $3 ELSE project_ids END
		 WHERE user_id = $1
		 RETURNING id, user_id, token, scope, project_ids, revoked_at, last_fetched_at, created_at`,
		userID, scope, projectIDs,
	).Scan(
		&sub.ID, &sub.UserID, &sub.Token, &sub.Scope,
		&sub.ProjectIDs, &sub.RevokedAt, &sub.LastFetchedAt, &sub.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("subscription.not_found", "subscription not found")
	}
	if err != nil {
		return nil, fmt.Errorf("calendar: update subscription: %w", err)
	}
	if sub.ProjectIDs == nil {
		sub.ProjectIDs = []uuid.UUID{}
	}
	return &sub, nil
}

// getSubscriptionByUserID loads the subscription for the given user.
func (s *Service) getSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (*Subscription, error) {
	var sub Subscription
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, token, scope, project_ids, revoked_at, last_fetched_at, created_at
		 FROM calendar_subscriptions WHERE user_id = $1`,
		userID,
	).Scan(
		&sub.ID, &sub.UserID, &sub.Token, &sub.Scope,
		&sub.ProjectIDs, &sub.RevokedAt, &sub.LastFetchedAt, &sub.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("subscription.not_found", "subscription not found")
	}
	if err != nil {
		return nil, fmt.Errorf("calendar: get subscription: %w", err)
	}
	if sub.ProjectIDs == nil {
		sub.ProjectIDs = []uuid.UUID{}
	}
	return &sub, nil
}

// getSubscriptionByToken loads the subscription for the given token (for ICS feed).
func (s *Service) getSubscriptionByToken(ctx context.Context, token string) (*Subscription, error) {
	var sub Subscription
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, token, scope, project_ids, revoked_at, last_fetched_at, created_at
		 FROM calendar_subscriptions WHERE token = $1`,
		token,
	).Scan(
		&sub.ID, &sub.UserID, &sub.Token, &sub.Scope,
		&sub.ProjectIDs, &sub.RevokedAt, &sub.LastFetchedAt, &sub.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("subscription.not_found", "subscription not found")
	}
	if err != nil {
		return nil, fmt.Errorf("calendar: get subscription by token: %w", err)
	}
	if sub.ProjectIDs == nil {
		sub.ProjectIDs = []uuid.UUID{}
	}
	return &sub, nil
}

// generateToken returns a random 32-byte base64url token.
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// listDistinctProjectIDsForSubscription returns distinct project_ids from
// project_events. When scope is per_project, it limits to the subscription's
// project_ids.
func (s *Service) listDistinctProjectIDsForSubscription(ctx context.Context, sub *Subscription) ([]uuid.UUID, error) {
	var rows pgx.Rows
	var err error

	if sub.Scope == "per_project" && len(sub.ProjectIDs) > 0 {
		rows, err = s.pool.Query(ctx,
			`SELECT DISTINCT project_id FROM project_events WHERE project_id = ANY($1)`,
			sub.ProjectIDs,
		)
	} else if sub.Scope == "per_project" {
		// No project_ids configured — nothing to show.
		return nil, nil
	} else {
		rows, err = s.pool.Query(ctx,
			`SELECT DISTINCT project_id FROM project_events`,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("calendar: list project ids: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("calendar: scan project id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// updateLastFetched sets last_fetched_at = now() for the subscription.
func (s *Service) updateLastFetched(ctx context.Context, subID uuid.UUID) {
	_, _ = s.pool.Exec(ctx,
		`UPDATE calendar_subscriptions SET last_fetched_at = now() WHERE id = $1`,
		subID,
	)
}

// authorizeProjectForUser returns true if the synthetic principal can read the project.
func (s *Service) authorizeProjectForUser(ctx context.Context, userID, projectID uuid.UUID) bool {
	synthetic := &platform.Principal{UserID: userID}
	_, _, err := s.projects.Authorize(ctx, synthetic, projectID, org.RoleViewer)
	return err == nil
}
