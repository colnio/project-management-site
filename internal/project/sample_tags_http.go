package project

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

type listSampleTagsInput struct {
	ID string `path:"id"`
}

type listSampleTagsOutput struct {
	Body []SampleTag
}

func (s *Service) handleListSampleTags(ctx context.Context, in *listSampleTagsInput) (*listSampleTagsOutput, error) {
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

	tags, err := s.ListSampleTags(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if tags == nil {
		tags = []SampleTag{}
	}
	return &listSampleTagsOutput{Body: tags}, nil
}

type createSampleTagInput struct {
	ID   string `path:"id"`
	Body struct {
		Label string `json:"label" required:"true" minLength:"1" maxLength:"64"`
	}
}

type createSampleTagOutput struct {
	Status int
	Body   *SampleTag
}

func (s *Service) handleCreateSampleTag(ctx context.Context, in *createSampleTagInput) (*createSampleTagOutput, error) {
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

	tag, err := s.CreateSampleTag(ctx, projectID, in.Body.Label, p.UserID)
	if err != nil {
		return nil, err
	}
	return &createSampleTagOutput{Status: http.StatusCreated, Body: tag}, nil
}

type updateSampleTagInput struct {
	ID    string `path:"id"`
	TagID string `path:"tag_id"`
	Body  struct {
		Label string `json:"label" required:"true" minLength:"1" maxLength:"64"`
	}
}

type updateSampleTagOutput struct {
	Body *SampleTag
}

func (s *Service) handleUpdateSampleTag(ctx context.Context, in *updateSampleTagInput) (*updateSampleTagOutput, error) {
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
		return nil, platform.BadRequest("sample_tag.invalid_id", "invalid tag ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	tag, err := s.UpdateSampleTag(ctx, projectID, tagID, in.Body.Label, p.UserID)
	if err != nil {
		return nil, err
	}
	return &updateSampleTagOutput{Body: tag}, nil
}

type deleteSampleTagInput struct {
	ID    string `path:"id"`
	TagID string `path:"tag_id"`
}

type deleteSampleTagOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleDeleteSampleTag(ctx context.Context, in *deleteSampleTagInput) (*deleteSampleTagOutput, error) {
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
		return nil, platform.BadRequest("sample_tag.invalid_id", "invalid tag ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if err := s.DeleteSampleTag(ctx, projectID, tagID, p.UserID); err != nil {
		return nil, err
	}
	return &deleteSampleTagOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}
