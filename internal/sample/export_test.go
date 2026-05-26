package sample

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// CreateSampleAuthorized runs the full create flow (authorize + insert + audit).
// This mirrors what the HTTP handler does, allowing tests to exercise auth paths.
func (s *Service) CreateSampleAuthorized(
	ctx context.Context,
	p *platform.Principal,
	projectID uuid.UUID,
	identifier, name, description, kind string,
	properties json.RawMessage,
	status string,
) (*Sample, error) {
	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}
	sm, err := s.createSample(ctx, projectID, identifier, name, description, kind, properties, status, p.UserID)
	if err != nil {
		return nil, err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "sample.create",
		ResourceType: "sample",
		ResourceID:   sm.ID.String(),
	})
	return sm, nil
}

// CreateSampleForTest exposes createSample directly (no auth check) for test fixtures.
func (s *Service) CreateSampleForTest(
	ctx context.Context,
	projectID uuid.UUID,
	identifier, name, description, kind string,
	properties json.RawMessage,
	status string,
	createdBy uuid.UUID,
) (*Sample, error) {
	return s.createSample(ctx, projectID, identifier, name, description, kind, properties, status, createdBy)
}

// PatchSampleForTest exposes patchSample for use in tests and records the audit entry.
func (s *Service) PatchSampleForTest(
	ctx context.Context,
	id uuid.UUID,
	name, description, kind, status, identifier *string,
	properties json.RawMessage,
) (*Sample, error) {
	sm, err := s.patchSample(ctx, id, name, description, kind, status, identifier, properties)
	if err != nil {
		return nil, err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Action:       "sample.update",
		ResourceType: "sample",
		ResourceID:   id.String(),
	})
	return sm, nil
}

// AddRelationForTest exposes addRelation for use in tests and records the audit entry.
func (s *Service) AddRelationForTest(
	ctx context.Context,
	parentID, childID uuid.UUID,
	relationType, notes string,
) (*SampleRelation, error) {
	rel, err := s.addRelation(ctx, parentID, childID, relationType, notes)
	if err != nil {
		return nil, err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Action:       "sample.relation_add",
		ResourceType: "sample",
		ResourceID:   parentID.String(),
	})
	return rel, nil
}

// GetLineageForTest exposes getLineage for use in tests.
func (s *Service) GetLineageForTest(ctx context.Context, sampleID uuid.UUID) (*LineageGraph, error) {
	return s.getLineage(ctx, sampleID)
}
