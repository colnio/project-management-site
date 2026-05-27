// Package iteration implements the Iteration module (B2): iteration CRUD,
// iteration-sample join management, and REST endpoints. It depends on the
// project module for authorization and the org module (transitively) for role
// resolution. It does NOT import any other Track-B sibling (sample, experiment,
// page, artifact) — cross-module references are bare UUIDs.
package iteration

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// Iteration is the core domain struct.
type Iteration struct {
	ID            uuid.UUID  `json:"id"`
	ProjectID     uuid.UUID  `json:"project_id"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	Status        string     `json:"status"`
	Position      int        `json:"position"`
	StartAt       *time.Time `json:"start_at,omitempty"`
	EndAt         *time.Time `json:"end_at,omitempty"`
	SummaryPageID *uuid.UUID `json:"summary_page_id,omitempty"`
	CreatedBy     uuid.UUID  `json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// IterationSample represents a row in iteration_samples.
type IterationSample struct {
	ID          uuid.UUID  `json:"id"`
	IterationID uuid.UUID  `json:"iteration_id"`
	SampleID    uuid.UUID  `json:"sample_id"`
	Role        *string    `json:"role,omitempty"`
	Note        string     `json:"note"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Service is the iteration module's domain service.
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

// ─── Core domain API ──────────────────────────────────────────────────────────

// GetIteration loads an iteration by id. Returns platform.NotFound if absent.
func (s *Service) GetIteration(ctx context.Context, id uuid.UUID) (*Iteration, error) {
	var it Iteration
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, title, description, status, position,
		        start_at, end_at, summary_page_id, created_by, created_at, updated_at
		 FROM iterations WHERE id = $1`,
		id,
	).Scan(
		&it.ID, &it.ProjectID, &it.Title, &it.Description, &it.Status, &it.Position,
		&it.StartAt, &it.EndAt, &it.SummaryPageID, &it.CreatedBy, &it.CreatedAt, &it.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("iteration.not_found", "iteration not found")
	}
	if err != nil {
		return nil, fmt.Errorf("iteration: get iteration: %w", err)
	}
	return &it, nil
}

// CreateIteration inserts a new iteration with position = max(existing positions)+1.
func (s *Service) CreateIteration(
	ctx context.Context,
	projectID uuid.UUID,
	title, description, status string,
	startAt, endAt *time.Time,
	creatorID uuid.UUID,
) (*Iteration, error) {
	if status == "" {
		status = "planned"
	}
	if description == "" {
		description = ""
	}

	var it Iteration
	err := s.pool.QueryRow(ctx,
		`INSERT INTO iterations (project_id, title, description, status, position, start_at, end_at, created_by)
		 VALUES ($1, $2, $3, $4,
		         COALESCE((SELECT MAX(position) FROM iterations WHERE project_id = $1), 0) + 1,
		         $5, $6, $7)
		 RETURNING id, project_id, title, description, status, position,
		           start_at, end_at, summary_page_id, created_by, created_at, updated_at`,
		projectID, title, description, status, startAt, endAt, creatorID,
	).Scan(
		&it.ID, &it.ProjectID, &it.Title, &it.Description, &it.Status, &it.Position,
		&it.StartAt, &it.EndAt, &it.SummaryPageID, &it.CreatedBy, &it.CreatedAt, &it.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("iteration: create iteration: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        creatorID,
		Action:       "iteration.create",
		ResourceType: "iteration",
		ResourceID:   it.ID.String(),
	})

	return &it, nil
}

// ListIterations returns all iterations for the given project ordered by position ASC.
func (s *Service) ListIterations(ctx context.Context, projectID uuid.UUID) ([]*Iteration, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, title, description, status, position,
		        start_at, end_at, summary_page_id, created_by, created_at, updated_at
		 FROM iterations
		 WHERE project_id = $1
		 ORDER BY position ASC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("iteration: list iterations: %w", err)
	}
	defer rows.Close()

	var result []*Iteration
	for rows.Next() {
		var it Iteration
		if err := rows.Scan(
			&it.ID, &it.ProjectID, &it.Title, &it.Description, &it.Status, &it.Position,
			&it.StartAt, &it.EndAt, &it.SummaryPageID, &it.CreatedBy, &it.CreatedAt, &it.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("iteration: scan iteration: %w", err)
		}
		result = append(result, &it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iteration: rows error: %w", err)
	}
	return result, nil
}

// UpdateIteration applies partial updates (non-nil/non-empty fields only).
func (s *Service) UpdateIteration(
	ctx context.Context,
	id uuid.UUID,
	title, description, status *string,
	startAt, endAt **time.Time,
	position *int,
	actorID uuid.UUID,
) (*Iteration, error) {
	// Gate: block transition to "active" when a HIGH-likelihood risk is open and
	// flagged for PI review.
	if status != nil && *status == "active" {
		var blocked bool
		err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(
				SELECT 1 FROM risks
				WHERE iteration_id = $1
				  AND likelihood = 'high'
				  AND flagged_for_pi_review = true
				  AND status = 'open'
			)`,
			id,
		).Scan(&blocked)
		if err != nil {
			return nil, fmt.Errorf("iteration: risk gate check: %w", err)
		}
		if blocked {
			return nil, platform.Conflict(
				"iteration.blocked_by_risk",
				"cannot activate: a HIGH-likelihood risk is flagged for PI review and unresolved",
			)
		}
	}

	var it Iteration
	err := s.pool.QueryRow(ctx,
		`UPDATE iterations
		 SET title       = CASE WHEN $2::text IS NOT NULL AND $2 != '' THEN $2 ELSE title END,
		     description = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE description END,
		     status      = CASE WHEN $4::text IS NOT NULL AND $4 != '' THEN $4 ELSE status END,
		     position    = CASE WHEN $5::int IS NOT NULL THEN $5 ELSE position END,
		     start_at    = CASE WHEN $6::timestamptz IS NOT NULL THEN $6 ELSE start_at END,
		     end_at      = CASE WHEN $7::timestamptz IS NOT NULL THEN $7 ELSE end_at END,
		     updated_at  = now()
		 WHERE id = $1
		 RETURNING id, project_id, title, description, status, position,
		           start_at, end_at, summary_page_id, created_by, created_at, updated_at`,
		id, title, description, status, position, startAt, endAt,
	).Scan(
		&it.ID, &it.ProjectID, &it.Title, &it.Description, &it.Status, &it.Position,
		&it.StartAt, &it.EndAt, &it.SummaryPageID, &it.CreatedBy, &it.CreatedAt, &it.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("iteration.not_found", "iteration not found")
	}
	if err != nil {
		return nil, fmt.Errorf("iteration: update iteration: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "iteration.update",
		ResourceType: "iteration",
		ResourceID:   it.ID.String(),
	})

	return &it, nil
}

// DeleteIteration deletes an iteration by id.
func (s *Service) DeleteIteration(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM iterations WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("iteration: delete iteration: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("iteration.not_found", "iteration not found")
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "iteration.delete",
		ResourceType: "iteration",
		ResourceID:   id.String(),
	})

	return nil
}

// LinkSample upserts a sample into an iteration (conflict on (iteration_id, sample_id) → update role/note).
func (s *Service) LinkSample(
	ctx context.Context,
	iterationID, sampleID uuid.UUID,
	role *string,
	note string,
	actorID uuid.UUID,
) (*IterationSample, error) {
	var is IterationSample
	err := s.pool.QueryRow(ctx,
		`INSERT INTO iteration_samples (iteration_id, sample_id, role, note)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (iteration_id, sample_id)
		 DO UPDATE SET role = EXCLUDED.role, note = EXCLUDED.note
		 RETURNING id, iteration_id, sample_id, role, note, created_at`,
		iterationID, sampleID, role, note,
	).Scan(
		&is.ID, &is.IterationID, &is.SampleID, &is.Role, &is.Note, &is.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("iteration: link sample: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "iteration.sample_link",
		ResourceType: "iteration",
		ResourceID:   iterationID.String(),
	})

	return &is, nil
}

// UnlinkSample removes a sample from an iteration.
func (s *Service) UnlinkSample(ctx context.Context, iterationID, sampleID uuid.UUID, actorID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM iteration_samples WHERE iteration_id = $1 AND sample_id = $2`,
		iterationID, sampleID,
	)
	if err != nil {
		return fmt.Errorf("iteration: unlink sample: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("iteration_sample.not_found", "sample not linked to iteration")
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "iteration.sample_unlink",
		ResourceType: "iteration",
		ResourceID:   iterationID.String(),
	})

	return nil
}

// ListSamples returns all samples linked to an iteration.
func (s *Service) ListSamples(ctx context.Context, iterationID uuid.UUID) ([]*IterationSample, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, iteration_id, sample_id, role, note, created_at
		 FROM iteration_samples
		 WHERE iteration_id = $1
		 ORDER BY created_at ASC`,
		iterationID,
	)
	if err != nil {
		return nil, fmt.Errorf("iteration: list samples: %w", err)
	}
	defer rows.Close()

	var result []*IterationSample
	for rows.Next() {
		var is IterationSample
		if err := rows.Scan(&is.ID, &is.IterationID, &is.SampleID, &is.Role, &is.Note, &is.CreatedAt); err != nil {
			return nil, fmt.Errorf("iteration: scan sample: %w", err)
		}
		result = append(result, &is)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iteration: rows error (samples): %w", err)
	}
	return result, nil
}
