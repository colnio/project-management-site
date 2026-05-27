package meeting

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
)

// CreateMeetingForTest mirrors the handler's create flow (createMeeting + audit)
// so tests can assert the audit entry without the huma wiring.
func (s *Service) CreateMeetingForTest(
	ctx context.Context,
	workspaceID uuid.UUID,
	projectID *uuid.UUID,
	title, kind string,
	chair *uuid.UUID,
	startAt time.Time,
	endAt *time.Time,
	location, agenda, notes string,
	attendees, decisions, actionItems json.RawMessage,
	createdBy uuid.UUID,
) (*Meeting, error) {
	m, err := s.createMeeting(ctx, workspaceID, projectID, title, kind, chair,
		startAt, endAt, location, agenda, notes,
		attendees, decisions, actionItems, createdBy)
	if err != nil {
		return nil, err
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        createdBy,
		Action:       "meeting.create",
		ResourceType: "meeting",
		ResourceID:   m.ID.String(),
	})
	return m, nil
}
