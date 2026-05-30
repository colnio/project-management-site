package approval

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// ─── Domain type ──────────────────────────────────────────────────────────────

// Comment is a single threaded review comment on an approval request.
type Comment struct {
	ID                uuid.UUID `json:"id"`
	ApprovalRequestID uuid.UUID `json:"approval_request_id"`
	AuthorID          uuid.UUID `json:"author_id"`
	AuthorName        string    `json:"author_name"`
	Body              string    `json:"body"`
	CreatedAt         time.Time `json:"created_at"`
}

// ─── Authorization helper ─────────────────────────────────────────────────────

// canViewApproval returns nil if the principal may read the given approval
// request — i.e. they are a named recipient OR any member/collaborator of the
// request's project (any role ≥ viewer).
func (s *Service) canViewApproval(ctx context.Context, p *platform.Principal, ar *ApprovalRequest) error {
	for _, r := range ar.Recipients {
		if r.UserID == p.UserID {
			return nil
		}
	}
	_, _, err := s.projects.Authorize(ctx, p, ar.ProjectID, org.RoleViewer)
	return err
}

// ─── ListComments ─────────────────────────────────────────────────────────────

// ListComments returns comments on a request ordered oldest-first.
// The caller must be able to view the approval request.
func (s *Service) ListComments(ctx context.Context, p *platform.Principal, requestID uuid.UUID) ([]*Comment, error) {
	ar, err := s.Get(ctx, requestID)
	if err != nil {
		return nil, err
	}
	if err := s.canViewApproval(ctx, p, ar); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT ac.id, ac.approval_request_id, ac.author_id,
		        COALESCE(NULLIF(u.display_name, ''), u.email) AS author_name,
		        ac.body, ac.created_at
		 FROM approval_comments ac
		 JOIN users u ON u.id = ac.author_id
		 WHERE ac.approval_request_id = $1
		 ORDER BY ac.created_at ASC`,
		requestID,
	)
	if err != nil {
		return nil, fmt.Errorf("approval: list comments query: %w", err)
	}
	defer rows.Close()

	var result []*Comment
	for rows.Next() {
		c, err := scanComment(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("approval: list comments rows: %w", err)
	}
	return result, nil
}

// ─── CreateComment ────────────────────────────────────────────────────────────

// CreateComment inserts a new comment on an approval request.
// Authorization: caller must be able to view the request (recipient or project member).
// After insert, best-effort inbox notifications are sent to other participants.
func (s *Service) CreateComment(ctx context.Context, p *platform.Principal, requestID uuid.UUID, body string) (*Comment, error) {
	if strings.TrimSpace(body) == "" {
		return nil, platform.BadRequest("approval.comment_empty", "comment body must not be empty")
	}

	ar, err := s.Get(ctx, requestID)
	if err != nil {
		return nil, err
	}
	if err := s.canViewApproval(ctx, p, ar); err != nil {
		return nil, err
	}

	// Insert comment.
	row := s.pool.QueryRow(ctx,
		`INSERT INTO approval_comments (approval_request_id, author_id, body)
		 VALUES ($1, $2, $3)
		 RETURNING id, approval_request_id, author_id,
		   (SELECT COALESCE(NULLIF(display_name, ''), email) FROM users WHERE id = $2),
		   body, created_at`,
		requestID, p.UserID, body,
	)
	c, err := scanComment(row)
	if err != nil {
		return nil, err
	}

	// Best-effort notifications: notify all OTHER participants (recipients + creator).
	if s.notify != nil {
		// Resolve author name for notification text.
		authorName := c.AuthorName

		// Build the set of participant user IDs to notify (excluding the comment author).
		notifySet := make(map[uuid.UUID]notifyTarget)
		// Always include the request creator if different from the author.
		if ar.CreatedBy != p.UserID {
			// Resolve creator email/name from recipients or from DB.
			creatorTarget, resolveErr := s.resolveUserTarget(ctx, ar.CreatedBy)
			if resolveErr == nil {
				notifySet[ar.CreatedBy] = creatorTarget
			}
		}
		// Include each listed recipient if different from the author.
		for _, r := range ar.Recipients {
			if r.UserID != p.UserID {
				notifySet[r.UserID] = notifyTarget{
					UserID: r.UserID,
					Email:  r.Email,
					Name:   r.DisplayName,
				}
			}
		}

		// Resolve project name.
		proj, _, projErr := s.projects.Authorize(ctx, p, ar.ProjectID, org.RoleViewer)
		projectName := ar.ProjectID.String()
		if projErr == nil && proj != nil {
			projectName = proj.Name
		}

		for _, target := range notifySet {
			if err := s.notify.EnqueueApprovalComment(ctx, requestID, ar.ProjectID, target.UserID,
				target.Email, projectName, authorName, body); err != nil {
				s.log.Warn("approval: enqueue comment notification failed",
					"to", target.Email, "request_id", requestID, "err", err)
			}
		}
	}

	return c, nil
}

// notifyTarget is a lightweight struct for notification dispatch.
type notifyTarget struct {
	UserID uuid.UUID
	Email  string
	Name   string
}

// resolveUserTarget loads a user's email and display name from the users table.
func (s *Service) resolveUserTarget(ctx context.Context, userID uuid.UUID) (notifyTarget, error) {
	var email, displayName string
	err := s.pool.QueryRow(ctx,
		`SELECT email, COALESCE(NULLIF(display_name, ''), email) FROM users WHERE id = $1`,
		userID,
	).Scan(&email, &displayName)
	if err != nil {
		return notifyTarget{}, fmt.Errorf("approval: resolve user target: %w", err)
	}
	return notifyTarget{UserID: userID, Email: email, Name: displayName}, nil
}

// ─── Scan helper ─────────────────────────────────────────────────────────────

func scanComment(row pgx.Row) (*Comment, error) {
	var c Comment
	err := row.Scan(
		&c.ID, &c.ApprovalRequestID, &c.AuthorID,
		&c.AuthorName, &c.Body, &c.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("approval.comment_not_found", "comment not found")
	}
	if err != nil {
		return nil, fmt.Errorf("approval: scan comment: %w", err)
	}
	return &c, nil
}
