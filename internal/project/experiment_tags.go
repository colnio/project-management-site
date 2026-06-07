package project

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// ExperimentTag is a project-defined label that can be assigned to experiments (via method).
type ExperimentTag struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"project_id"`
	Label     string    `json:"label"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func normalizeTagLabel(label string) (string, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return "", platform.BadRequest("experiment_tag.invalid_label", "tag label is required")
	}
	if len(label) > 64 {
		return "", platform.BadRequest("experiment_tag.invalid_label", "tag label must be at most 64 characters")
	}
	return label, nil
}

// ListExperimentTags returns tags for a project ordered by position then label.
func (s *Service) ListExperimentTags(ctx context.Context, projectID uuid.UUID) ([]ExperimentTag, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, label, position, created_at, updated_at
		 FROM project_experiment_tags
		 WHERE project_id = $1
		 ORDER BY position ASC, lower(label) ASC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("project: list experiment tags: %w", err)
	}
	defer rows.Close()

	var out []ExperimentTag
	for rows.Next() {
		var t ExperimentTag
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.Label, &t.Position, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, fmt.Errorf("project: scan experiment tag: %w", err)
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("project: list experiment tags rows: %w", err)
	}
	return out, nil
}

// CreateExperimentTag adds a tag to a project.
func (s *Service) CreateExperimentTag(ctx context.Context, projectID uuid.UUID, label string, actorID uuid.UUID) (*ExperimentTag, error) {
	label, err := normalizeTagLabel(label)
	if err != nil {
		return nil, err
	}

	var t ExperimentTag
	err = s.pool.QueryRow(ctx,
		`INSERT INTO project_experiment_tags (project_id, label, position)
		 VALUES ($1, $2, COALESCE((SELECT MAX(position) FROM project_experiment_tags WHERE project_id = $1), 0) + 1)
		 RETURNING id, project_id, label, position, created_at, updated_at`,
		projectID, label,
	).Scan(&t.ID, &t.ProjectID, &t.Label, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "project_experiment_tags_label_unique") {
			return nil, platform.Conflict("experiment_tag.duplicate", "a tag with this label already exists")
		}
		return nil, fmt.Errorf("project: create experiment tag: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "experiment_tag.create",
		ResourceType: "project_experiment_tag",
		ResourceID:   t.ID.String(),
	})
	return &t, nil
}

// UpdateExperimentTag changes a tag label.
func (s *Service) UpdateExperimentTag(ctx context.Context, projectID, tagID uuid.UUID, label string, actorID uuid.UUID) (*ExperimentTag, error) {
	label, err := normalizeTagLabel(label)
	if err != nil {
		return nil, err
	}

	var t ExperimentTag
	err = s.pool.QueryRow(ctx,
		`UPDATE project_experiment_tags
		 SET label = $3, updated_at = now()
		 WHERE id = $1 AND project_id = $2
		 RETURNING id, project_id, label, position, created_at, updated_at`,
		tagID, projectID, label,
	).Scan(&t.ID, &t.ProjectID, &t.Label, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, platform.NotFound("experiment_tag.not_found", "tag not found")
		}
		if strings.Contains(err.Error(), "project_experiment_tags_label_unique") {
			return nil, platform.Conflict("experiment_tag.duplicate", "a tag with this label already exists")
		}
		return nil, fmt.Errorf("project: update experiment tag: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "experiment_tag.update",
		ResourceType: "project_experiment_tag",
		ResourceID:   t.ID.String(),
	})
	return &t, nil
}

// DeleteExperimentTag removes a tag definition and strips the label from every
// experiment in the project that still carries it, so no orphan/unremovable tag
// lingers on an experiment once its definition is gone.
func (s *Service) DeleteExperimentTag(ctx context.Context, projectID, tagID uuid.UUID, actorID uuid.UUID) error {
	tag, err := s.getExperimentTag(ctx, projectID, tagID)
	if err != nil {
		return err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("project: delete experiment tag: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	ct, err := tx.Exec(ctx,
		`DELETE FROM project_experiment_tags WHERE id = $1 AND project_id = $2`,
		tagID, projectID,
	)
	if err != nil {
		return fmt.Errorf("project: delete experiment tag: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return platform.NotFound("experiment_tag.not_found", "tag not found")
	}

	if _, err := tx.Exec(ctx,
		`UPDATE experiments SET tags = tags - $2, updated_at = now()
		 WHERE project_id = $1 AND tags ? $2`,
		projectID, tag.Label,
	); err != nil {
		return fmt.Errorf("project: delete experiment tag: strip from experiments: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("project: delete experiment tag: commit: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "experiment_tag.delete",
		ResourceType: "project_experiment_tag",
		ResourceID:   tag.ID.String(),
	})
	return nil
}

func (s *Service) getExperimentTag(ctx context.Context, projectID, tagID uuid.UUID) (*ExperimentTag, error) {
	var t ExperimentTag
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, label, position, created_at, updated_at
		 FROM project_experiment_tags WHERE id = $1 AND project_id = $2`,
		tagID, projectID,
	).Scan(&t.ID, &t.ProjectID, &t.Label, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, platform.NotFound("experiment_tag.not_found", "tag not found")
		}
		return nil, fmt.Errorf("project: get experiment tag: %w", err)
	}
	return &t, nil
}
