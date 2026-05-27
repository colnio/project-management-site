package meeting

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// CreateMeetingForTest exposes createMeeting for use in external test files.
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
	return m, nil
}
