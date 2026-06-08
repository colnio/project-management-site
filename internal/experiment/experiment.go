// Package experiment implements the Experiment module (B5): experiment CRUD,
// sample linking, and project-scoped access control.
// It depends on the project module for authorization and audit for recording mutations.
// iteration_id and sample_id are stored as bare UUIDs with no FK constraints —
// the iteration and sample modules own their respective tables.
package experiment

import (
	"context"
	"encoding/json"
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

// Experiment is the core domain struct.
// IterationID and NotesPageID are stored as bare UUIDs; no FK constraints exist.
type Experiment struct {
	ID            uuid.UUID       `json:"id"`
	ProjectID     uuid.UUID       `json:"project_id"`
	IterationID   *uuid.UUID      `json:"iteration_id,omitempty"`
	Title         string          `json:"title"`
	Method        string          `json:"method"`
	Tags          []string        `json:"tags,omitempty"`
	Parameters    json.RawMessage `json:"parameters"`
	ResultSummary string          `json:"result_summary"`
	NotesPageID   *uuid.UUID      `json:"notes_page_id,omitempty"`
	PerformedBy   *uuid.UUID      `json:"performed_by,omitempty"`
	PerformedAt   *time.Time      `json:"performed_at,omitempty"`
	StartedAt     *time.Time      `json:"started_at,omitempty"`
	EndedAt       *time.Time      `json:"ended_at,omitempty"`
	Status        string          `json:"status"`
	Seq           int             `json:"seq"`
	Code          string          `json:"code"`
	CreatedBy     uuid.UUID       `json:"created_by"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// ExperimentSample represents a sample linked to an experiment.
type ExperimentSample struct {
	SampleID uuid.UUID `json:"sample_id"`
	Role     *string   `json:"role,omitempty"`
	Note     string    `json:"note"`
}

// Service is the experiment module's domain service.
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

// GetExperiment loads an experiment by id. Returns platform.NotFound if absent.
func (s *Service) GetExperiment(ctx context.Context, id uuid.UUID) (*Experiment, error) {
	var e Experiment
	err := scanExperiment(s.pool.QueryRow(ctx,
		`SELECT `+experimentSelectCols+` FROM experiments WHERE id = $1`,
		id,
	), &e)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("experiment.not_found", "experiment not found")
	}
	if err != nil {
		return nil, fmt.Errorf("experiment: get experiment: %w", err)
	}
	return &e, nil
}

// CreateExperiment inserts a new experiment in the given project.
func (s *Service) CreateExperiment(
	ctx context.Context,
	projectID uuid.UUID,
	title string,
	method string,
	tagLabels []string,
	parameters json.RawMessage,
	resultSummary string,
	iterationID *uuid.UUID,
	status string,
	performedAt *time.Time,
	startedAt *time.Time,
	endedAt *time.Time,
	creatorID uuid.UUID,
) (*Experiment, error) {
	tagLabels = normalizeTagLabels(tagLabels)
	var err error
	if len(tagLabels) > 0 {
		tagLabels, err = s.canonicalizeTagLabels(ctx, projectID, tagLabels)
		if err != nil {
			return nil, err
		}
		method = primaryMethod(tagLabels)
	} else {
		if method == "" {
			method = "custom"
		}
		if method != "custom" {
			tagLabels = []string{method}
		}
	}
	tagsJSON, err := marshalTags(tagLabels)
	if err != nil {
		return nil, err
	}
	if status == "" {
		status = "planned"
	}
	if len(parameters) == 0 {
		parameters = json.RawMessage("{}")
	}

	var e Experiment
	err = scanExperiment(s.pool.QueryRow(ctx,
		`INSERT INTO experiments
		   (project_id, iteration_id, title, method, tags, parameters, result_summary,
		    status, performed_at, started_at, ended_at, created_by,
		    seq, code)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
		         COALESCE((SELECT MAX(seq) FROM experiments WHERE project_id = $1), 0) + 1,
		         'EX-' || (COALESCE((SELECT MAX(seq) FROM experiments WHERE project_id = $1), 0) + 1))
		 RETURNING `+experimentSelectCols,
		projectID, iterationID, title, method, tagsJSON, parameters, resultSummary,
		status, performedAt, startedAt, endedAt, creatorID,
	), &e)
	if err != nil {
		return nil, fmt.Errorf("experiment: create: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        creatorID,
		Action:       "experiment.create",
		ResourceType: "experiment",
		ResourceID:   e.ID.String(),
	})

	return &e, nil
}

// ListExperiments returns experiments for a project with optional filters.
func (s *Service) ListExperiments(
	ctx context.Context,
	projectID uuid.UUID,
	iterationID *uuid.UUID,
	method string,
	sampleID *uuid.UUID,
) ([]*Experiment, error) {
	query := `SELECT DISTINCT e.id, e.project_id, e.iteration_id, e.title, e.method, e.tags, e.parameters,
	                 e.result_summary, e.notes_page_id, e.performed_by, e.performed_at, e.started_at, e.ended_at,
	                 e.status, COALESCE(e.seq, 0), COALESCE(e.code, ''),
	                 e.created_by, e.created_at, e.updated_at
	          FROM experiments e`

	args := []any{projectID}
	argN := 2

	if sampleID != nil {
		query += ` JOIN experiment_samples es ON es.experiment_id = e.id AND es.sample_id = $` + fmt.Sprintf("%d", argN)
		args = append(args, *sampleID)
		argN++
	}

	query += ` WHERE e.project_id = $1`

	if iterationID != nil {
		query += fmt.Sprintf(` AND e.iteration_id = $%d`, argN)
		args = append(args, *iterationID)
		argN++
	}
	if method != "" {
		query += fmt.Sprintf(` AND (e.method = $%d OR e.tags @> jsonb_build_array($%d::text))`, argN, argN)
		args = append(args, method)
		argN++
	}

	query += ` ORDER BY e.created_at`
	_ = argN

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("experiment: list: %w", err)
	}
	defer rows.Close()

	var result []*Experiment
	for rows.Next() {
		var e Experiment
		if err := scanExperiment(rows, &e); err != nil {
			return nil, fmt.Errorf("experiment: scan: %w", err)
		}
		result = append(result, &e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("experiment: rows error: %w", err)
	}
	return result, nil
}

// UpdateExperiment applies partial updates.
func (s *Service) UpdateExperiment(
	ctx context.Context,
	id uuid.UUID,
	title *string,
	method string,
	tagLabels *[]string,
	parameters json.RawMessage,
	resultSummary *string,
	iterationID *uuid.UUID,
	clearIterationID bool,
	status string,
	performedAt *time.Time,
	startedAt *time.Time,
	endedAt *time.Time,
	actorID uuid.UUID,
) (*Experiment, error) {
	existing, err := s.GetExperiment(ctx, id)
	if err != nil {
		return nil, err
	}

	// Build update dynamically.
	setClauses := []string{"updated_at = now()"}
	args := []any{}
	argN := 1

	if title != nil {
		setClauses = append(setClauses, fmt.Sprintf("title = $%d", argN))
		args = append(args, *title)
		argN++
	}
	if tagLabels != nil {
		labels := normalizeTagLabels(*tagLabels)
		if len(labels) > 0 {
			labels, err = s.canonicalizeTagLabels(ctx, existing.ProjectID, labels)
			if err != nil {
				return nil, err
			}
			method = primaryMethod(labels)
		} else {
			method = "custom"
		}
		tagsJSON, err := marshalTags(labels)
		if err != nil {
			return nil, err
		}
		setClauses = append(setClauses, fmt.Sprintf("tags = $%d", argN))
		args = append(args, tagsJSON)
		argN++
		setClauses = append(setClauses, fmt.Sprintf("method = $%d", argN))
		args = append(args, method)
		argN++
	} else if method != "" {
		setClauses = append(setClauses, fmt.Sprintf("method = $%d", argN))
		args = append(args, method)
		argN++
		legacyTags := []string{}
		if method != "custom" {
			legacyTags = []string{method}
		}
		tagsJSON, err := marshalTags(legacyTags)
		if err != nil {
			return nil, err
		}
		setClauses = append(setClauses, fmt.Sprintf("tags = $%d", argN))
		args = append(args, tagsJSON)
		argN++
	}
	if len(parameters) > 0 {
		setClauses = append(setClauses, fmt.Sprintf("parameters = $%d", argN))
		args = append(args, parameters)
		argN++
	}
	if resultSummary != nil {
		setClauses = append(setClauses, fmt.Sprintf("result_summary = $%d", argN))
		args = append(args, *resultSummary)
		argN++
	}
	if clearIterationID {
		setClauses = append(setClauses, "iteration_id = NULL")
	} else if iterationID != nil {
		setClauses = append(setClauses, fmt.Sprintf("iteration_id = $%d", argN))
		args = append(args, *iterationID)
		argN++
	}
	if status != "" {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argN))
		args = append(args, status)
		argN++
	}
	if performedAt != nil {
		setClauses = append(setClauses, fmt.Sprintf("performed_at = $%d", argN))
		args = append(args, *performedAt)
		argN++
	}
	if startedAt != nil {
		setClauses = append(setClauses, fmt.Sprintf("started_at = $%d", argN))
		args = append(args, *startedAt)
		argN++
	}
	if endedAt != nil {
		setClauses = append(setClauses, fmt.Sprintf("ended_at = $%d", argN))
		args = append(args, *endedAt)
		argN++
	}

	// Build SET clause.
	setSQL := ""
	for i, c := range setClauses {
		if i > 0 {
			setSQL += ", "
		}
		setSQL += c
	}

	args = append(args, id)
	idArg := argN

	query := fmt.Sprintf(
		`UPDATE experiments SET %s WHERE id = $%d
		 RETURNING `+experimentSelectCols,
		setSQL, idArg,
	)

	var e Experiment
	err = scanExperiment(s.pool.QueryRow(ctx, query, args...), &e)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("experiment.not_found", "experiment not found")
	}
	if err != nil {
		return nil, fmt.Errorf("experiment: update: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "experiment.update",
		ResourceType: "experiment",
		ResourceID:   e.ID.String(),
	})

	return &e, nil
}

// LinkSample upserts an experiment_samples row.
func (s *Service) LinkSample(
	ctx context.Context,
	experimentID uuid.UUID,
	sampleID uuid.UUID,
	role *string,
	note string,
	actorID uuid.UUID,
) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO experiment_samples (experiment_id, sample_id, role, note)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (experiment_id, sample_id)
		 DO UPDATE SET role = EXCLUDED.role, note = EXCLUDED.note`,
		experimentID, sampleID, role, note,
	)
	if err != nil {
		return fmt.Errorf("experiment: link sample: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "experiment.sample_link",
		ResourceType: "experiment",
		ResourceID:   experimentID.String(),
	})

	return nil
}

// UnlinkSample removes an experiment_samples row.
func (s *Service) UnlinkSample(
	ctx context.Context,
	experimentID uuid.UUID,
	sampleID uuid.UUID,
	actorID uuid.UUID,
) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM experiment_samples WHERE experiment_id = $1 AND sample_id = $2`,
		experimentID, sampleID,
	)
	if err != nil {
		return fmt.Errorf("experiment: unlink sample: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("experiment.sample_not_found", "sample not linked to this experiment")
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "experiment.sample_unlink",
		ResourceType: "experiment",
		ResourceID:   experimentID.String(),
	})

	return nil
}

// ListSamples returns all samples linked to an experiment.
func (s *Service) ListSamples(ctx context.Context, experimentID uuid.UUID) ([]*ExperimentSample, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT sample_id, role, note FROM experiment_samples
		 WHERE experiment_id = $1 ORDER BY created_at`,
		experimentID,
	)
	if err != nil {
		return nil, fmt.Errorf("experiment: list samples: %w", err)
	}
	defer rows.Close()

	var result []*ExperimentSample
	for rows.Next() {
		var es ExperimentSample
		if err := rows.Scan(&es.SampleID, &es.Role, &es.Note); err != nil {
			return nil, fmt.Errorf("experiment: scan sample: %w", err)
		}
		result = append(result, &es)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("experiment: rows error: %w", err)
	}
	return result, nil
}
