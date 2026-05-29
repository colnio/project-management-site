package notify

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

type workspaceOwner struct {
	UserID uuid.UUID
	Email  string
}

func (s *Service) listWorkspaceOwners(ctx context.Context, workspaceID uuid.UUID) ([]workspaceOwner, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT u.id, u.email FROM users u
		 JOIN workspace_memberships m ON m.user_id = u.id
		 WHERE m.workspace_id = $1 AND m.role = 'owner' AND u.status = 'approved'`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("notify: list workspace owners: %w", err)
	}
	defer rows.Close()
	var owners []workspaceOwner
	for rows.Next() {
		var o workspaceOwner
		if err := rows.Scan(&o.UserID, &o.Email); err != nil {
			return nil, err
		}
		owners = append(owners, o)
	}
	return owners, rows.Err()
}

// EnqueuePIFlagForWorkspaceOwners emails all workspace owners about a PI flag.
func (s *Service) EnqueuePIFlagForWorkspaceOwners(ctx context.Context, workspaceID uuid.UUID, projectName, actionPath, riskTitle, idempotencyPrefix string) error {
	owners, err := s.listWorkspaceOwners(ctx, workspaceID)
	if err != nil {
		return err
	}
	for _, o := range owners {
		idem := fmt.Sprintf("%s:%s", idempotencyPrefix, o.UserID)
		uid := o.UserID
		if err := s.EnqueuePIFlagReview(ctx, idem, &uid, o.Email, projectName, actionPath, riskTitle); err != nil {
			s.log.Warn("notify: pi flag enqueue failed", "to", o.Email, "err", err)
		}
	}
	return nil
}
