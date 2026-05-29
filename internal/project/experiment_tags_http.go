package project

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

type listExperimentTagsInput struct {
	ID string `path:"id"`
}

type listExperimentTagsOutput struct {
	Body []ExperimentTag
}

func (s *Service) handleListExperimentTags(ctx context.Context, in *listExperimentTagsInput) (*listExperimentTagsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	tags, err := s.ListExperimentTags(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if tags == nil {
		tags = []ExperimentTag{}
	}
	return &listExperimentTagsOutput{Body: tags}, nil
}

type createExperimentTagInput struct {
	ID   string `path:"id"`
	Body struct {
		Label string `json:"label" required:"true" minLength:"1" maxLength:"64"`
	}
}

type createExperimentTagOutput struct {
	Status int
	Body   *ExperimentTag
}

func (s *Service) handleCreateExperimentTag(ctx context.Context, in *createExperimentTagInput) (*createExperimentTagOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	tag, err := s.CreateExperimentTag(ctx, projectID, in.Body.Label, p.UserID)
	if err != nil {
		return nil, err
	}
	return &createExperimentTagOutput{Status: http.StatusCreated, Body: tag}, nil
}

type updateExperimentTagInput struct {
	ID    string `path:"id"`
	TagID string `path:"tag_id"`
	Body  struct {
		Label string `json:"label" required:"true" minLength:"1" maxLength:"64"`
	}
}

type updateExperimentTagOutput struct {
	Body *ExperimentTag
}

func (s *Service) handleUpdateExperimentTag(ctx context.Context, in *updateExperimentTagInput) (*updateExperimentTagOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}
	tagID, err := uuid.Parse(in.TagID)
	if err != nil {
		return nil, platform.BadRequest("experiment_tag.invalid_id", "invalid tag ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	tag, err := s.UpdateExperimentTag(ctx, projectID, tagID, in.Body.Label, p.UserID)
	if err != nil {
		return nil, err
	}
	return &updateExperimentTagOutput{Body: tag}, nil
}

type deleteExperimentTagInput struct {
	ID    string `path:"id"`
	TagID string `path:"tag_id"`
}

type deleteExperimentTagOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleDeleteExperimentTag(ctx context.Context, in *deleteExperimentTagInput) (*deleteExperimentTagOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}
	tagID, err := uuid.Parse(in.TagID)
	if err != nil {
		return nil, platform.BadRequest("experiment_tag.invalid_id", "invalid tag ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if err := s.DeleteExperimentTag(ctx, projectID, tagID, p.UserID); err != nil {
		return nil, err
	}
	return &deleteExperimentTagOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}
