package approval

import "context"

// HandleListForTest exposes handleList for integration tests.
func (s *Service) HandleListForTest(ctx context.Context, projectID string) (*listApprovalsOutput, error) {
	return s.handleList(ctx, &listApprovalsInput{ID: projectID})
}
