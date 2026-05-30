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

// SampleTag is a project-defined label that can be assigned to samples.
type SampleTag struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"project_id"`
	Label     string    `json:"label"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func normalizeSampleTagLabel(label string) (string, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return "", platform.BadRequest("sample_tag.invalid_label", "tag label is required")
	}
	if len(label) > 64 {
		return "", platform.BadRequest("sample_tag.invalid_label", "tag label must be at most 64 characters")
	}
	return label, nil
}

// ListSampleTags returns tags for a project ordered by position then label.
func (s *Service) ListSampleTags(ctx context.Context, projectID uuid.UUID) ([]SampleTag, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, label, position, created_at, updated_at
		 FROM project_sample_tags
		 WHERE project_id = $1
		 ORDER BY position ASC, lower(label) ASC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("project: list sample tags: %w", err)
	}
	defer rows.Close()

	var out []SampleTag
	for rows.Next() {
		var t SampleTag
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.Label, &t.Position, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, fmt.Errorf("project: scan sample tag: %w", err)
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("project: list sample tags rows: %w", err)
	}
	return out, nil
}

// CreateSampleTag adds a tag to a project.
func (s *Service) CreateSampleTag(ctx context.Context, projectID uuid.UUID, label string, actorID uuid.UUID) (*SampleTag, error) {
	label, err := normalizeSampleTagLabel(label)
	if err != nil {
		return nil, err
	}

	var t SampleTag
	err = s.pool.QueryRow(ctx,
		`INSERT INTO project_sample_tags (project_id, label, position)
		 VALUES ($1, $2, COALESCE((SELECT MAX(position) FROM project_sample_tags WHERE project_id = $1), 0) + 1)
		 RETURNING id, project_id, label, position, created_at, updated_at`,
		projectID, label,
	).Scan(&t.ID, &t.ProjectID, &t.Label, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "project_sample_tags_label_unique") {
			return nil, platform.Conflict("sample_tag.duplicate", "a tag with this label already exists")
		}
		return nil, fmt.Errorf("project: create sample tag: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "sample_tag.create",
		ResourceType: "project_sample_tag",
		ResourceID:   t.ID.String(),
	})
	return &t, nil
}

// UpdateSampleTag changes a tag label.
func (s *Service) UpdateSampleTag(ctx context.Context, projectID, tagID uuid.UUID, label string, actorID uuid.UUID) (*SampleTag, error) {
	label, err := normalizeSampleTagLabel(label)
	if err != nil {
		return nil, err
	}

	var t SampleTag
	err = s.pool.QueryRow(ctx,
		`UPDATE project_sample_tags
		 SET label = $3, updated_at = now()
		 WHERE id = $1 AND project_id = $2
		 RETURNING id, project_id, label, position, created_at, updated_at`,
		tagID, projectID, label,
	).Scan(&t.ID, &t.ProjectID, &t.Label, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, platform.NotFound("sample_tag.not_found", "tag not found")
		}
		if strings.Contains(err.Error(), "project_sample_tags_label_unique") {
			return nil, platform.Conflict("sample_tag.duplicate", "a tag with this label already exists")
		}
		return nil, fmt.Errorf("project: update sample tag: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "sample_tag.update",
		ResourceType: "project_sample_tag",
		ResourceID:   t.ID.String(),
	})
	return &t, nil
}

// DeleteSampleTag removes a tag definition (does not rewrite samples already using the label).
func (s *Service) DeleteSampleTag(ctx context.Context, projectID, tagID uuid.UUID, actorID uuid.UUID) error {
	tag, err := s.getSampleTag(ctx, projectID, tagID)
	if err != nil {
		return err
	}

	ct, err := s.pool.Exec(ctx,
		`DELETE FROM project_sample_tags WHERE id = $1 AND project_id = $2`,
		tagID, projectID,
	)
	if err != nil {
		return fmt.Errorf("project: delete sample tag: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return platform.NotFound("sample_tag.not_found", "tag not found")
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "sample_tag.delete",
		ResourceType: "project_sample_tag",
		ResourceID:   tag.ID.String(),
	})
	return nil
}

func (s *Service) getSampleTag(ctx context.Context, projectID, tagID uuid.UUID) (*SampleTag, error) {
	var t SampleTag
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, label, position, created_at, updated_at
		 FROM project_sample_tags WHERE id = $1 AND project_id = $2`,
		tagID, projectID,
	).Scan(&t.ID, &t.ProjectID, &t.Label, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, platform.NotFound("sample_tag.not_found", "tag not found")
		}
		return nil, fmt.Errorf("project: get sample tag: %w", err)
	}
	return &t, nil
}
