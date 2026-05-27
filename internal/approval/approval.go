// Package approval implements the Approval module: project-scoped approval
// requests that capture a description, an AI review summary, a set of
// recipient snapshots, and a binary approve/reject decision.
//
// Authorization rules:
//   - Create: caller must be a project editor.
//   - Decide: caller must be a listed recipient OR a project editor.
//   - Read:   no additional check beyond scope (callers provide their token).
package approval

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// ─── Domain types ─────────────────────────────────────────────────────────────

// RecipientSnapshot captures the user identity at the time of request creation.
type RecipientSnapshot struct {
	UserID      uuid.UUID `json:"user_id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
}

// ApprovalRequest is the core domain struct.
type ApprovalRequest struct {
	ID          uuid.UUID           `json:"id"`
	ProjectID   uuid.UUID           `json:"project_id"`
	IterationID *uuid.UUID          `json:"iteration_id,omitempty"`
	CreatedBy   uuid.UUID           `json:"created_by"`
	Description string              `json:"description"`
	AIReview    string              `json:"ai_review"`
	Status      string              `json:"status"`
	Recipients  []RecipientSnapshot `json:"recipients"`
	DecidedBy   *uuid.UUID          `json:"decided_by,omitempty"`
	DecidedAt   *time.Time          `json:"decided_at,omitempty"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

// PendingItem is a lightweight projection for inbox aggregation.
type PendingItem struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"project_id"`
	CreatedAt time.Time `json:"created_at"`
}

// ─── Service ──────────────────────────────────────────────────────────────────

// Service is the approval module's domain service.
type Service struct {
	pool     *pgxpool.Pool
	projects *project.Service
	org      *org.Service
	rec      audit.Recorder
	cfg      *config.Config
	log      *slog.Logger
}

// NewService constructs a Service.
func NewService(
	pool *pgxpool.Pool,
	projects *project.Service,
	orgSvc *org.Service,
	rec audit.Recorder,
	cfg *config.Config,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:     pool,
		projects: projects,
		org:      orgSvc,
		rec:      rec,
		cfg:      cfg,
		log:      log,
	}
}

// ─── Scan helpers ─────────────────────────────────────────────────────────────

func scanApprovalRequest(row pgx.Row) (*ApprovalRequest, error) {
	var ar ApprovalRequest
	var recipientsJSON []byte
	err := row.Scan(
		&ar.ID, &ar.ProjectID, &ar.IterationID, &ar.CreatedBy,
		&ar.Description, &ar.AIReview, &ar.Status,
		&recipientsJSON,
		&ar.DecidedBy, &ar.DecidedAt,
		&ar.CreatedAt, &ar.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("approval.not_found", "approval request not found")
	}
	if err != nil {
		return nil, fmt.Errorf("approval: scan: %w", err)
	}
	if len(recipientsJSON) > 0 {
		if err := json.Unmarshal(recipientsJSON, &ar.Recipients); err != nil {
			return nil, fmt.Errorf("approval: unmarshal recipients: %w", err)
		}
	}
	if ar.Recipients == nil {
		ar.Recipients = []RecipientSnapshot{}
	}
	return &ar, nil
}

const approvalCols = `id, project_id, iteration_id, created_by,
	description, ai_review, status,
	recipients,
	decided_by, decided_at,
	created_at, updated_at`

// ─── Create ───────────────────────────────────────────────────────────────────

// Create inserts a new approval request.
// Recipients are resolved by merging workspace members and project collaborators,
// then filtering to the requested user IDs. Unknown IDs are silently skipped.
// After a successful insert, best-effort notification emails are sent to each recipient.
func (s *Service) Create(
	ctx context.Context,
	p *platform.Principal,
	projectID uuid.UUID,
	iterationID *uuid.UUID,
	description, aiReview string,
	recipientUserIDs []uuid.UUID,
) (*ApprovalRequest, error) {
	// Authorize: must be a project editor.
	proj, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleEditor)
	if err != nil {
		return nil, err
	}

	// Resolve recipients: merge workspace members + project collaborators.
	type userInfo struct {
		Email       string
		DisplayName string
	}
	userMap := make(map[uuid.UUID]userInfo)

	members, err := s.org.ListMembersEnriched(ctx, proj.WorkspaceID)
	if err != nil {
		return nil, fmt.Errorf("approval: list members: %w", err)
	}
	for _, m := range members {
		userMap[m.UserID] = userInfo{Email: m.Email, DisplayName: m.DisplayName}
	}

	collabs, err := s.org.ListCollaboratorsEnriched(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("approval: list collaborators: %w", err)
	}
	for _, c := range collabs {
		userMap[c.UserID] = userInfo{Email: c.Email, DisplayName: c.DisplayName}
	}

	// Build recipient snapshots, skipping unknown user IDs.
	var recipients []RecipientSnapshot
	for _, uid := range recipientUserIDs {
		info, ok := userMap[uid]
		if !ok {
			s.log.Warn("approval: unknown recipient user_id, skipping", "user_id", uid)
			continue
		}
		recipients = append(recipients, RecipientSnapshot{
			UserID:      uid,
			Email:       info.Email,
			DisplayName: info.DisplayName,
		})
	}
	if recipients == nil {
		recipients = []RecipientSnapshot{}
	}

	recipientsJSON, err := json.Marshal(recipients)
	if err != nil {
		return nil, fmt.Errorf("approval: marshal recipients: %w", err)
	}

	// Insert.
	row := s.pool.QueryRow(ctx,
		`INSERT INTO approval_requests
		   (project_id, iteration_id, created_by, description, ai_review, recipients)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING `+approvalCols,
		projectID, iterationID, p.UserID, description, aiReview, recipientsJSON,
	)
	ar, err := scanApprovalRequest(row)
	if err != nil {
		return nil, err
	}

	// Audit.
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "approval.create",
		ResourceType: "approval_request",
		ResourceID:   ar.ID.String(),
	})

	// Best-effort emails — a failure must not fail the request.
	for _, r := range ar.Recipients {
		if err := s.sendApprovalEmail(r.Email, proj.Name, description, aiReview, ar.ID); err != nil {
			s.log.Warn("approval: send notification email failed",
				"to", r.Email, "request_id", ar.ID, "err", err)
		}
	}

	return ar, nil
}

// ─── Decide ───────────────────────────────────────────────────────────────────

// Decide approves or rejects a pending approval request.
// The caller must be either a listed recipient or a project editor.
func (s *Service) Decide(ctx context.Context, p *platform.Principal, requestID uuid.UUID, approve bool) error {
	ar, err := s.Get(ctx, requestID)
	if err != nil {
		return err
	}
	if ar.Status != "pending" {
		return platform.BadRequest("approval.already_decided", "approval request has already been decided")
	}

	// Authorization: recipient OR project editor.
	isRecipient := false
	for _, r := range ar.Recipients {
		if r.UserID == p.UserID {
			isRecipient = true
			break
		}
	}
	if !isRecipient {
		if _, _, authErr := s.projects.Authorize(ctx, p, ar.ProjectID, org.RoleEditor); authErr != nil {
			return platform.Forbidden("you are not a recipient or project editor for this approval request")
		}
	}

	newStatus := "rejected"
	if approve {
		newStatus = "approved"
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE approval_requests
		 SET status = $2, decided_by = $3, decided_at = now(), updated_at = now()
		 WHERE id = $1`,
		requestID, newStatus, p.UserID,
	)
	if err != nil {
		return fmt.Errorf("approval: decide: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "approval.decide",
		ResourceType: "approval_request",
		ResourceID:   requestID.String(),
	})

	return nil
}

// ─── Get ──────────────────────────────────────────────────────────────────────

// Get loads an approval request by ID.
func (s *Service) Get(ctx context.Context, id uuid.UUID) (*ApprovalRequest, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+approvalCols+` FROM approval_requests WHERE id = $1`, id)
	return scanApprovalRequest(row)
}

// ─── ListByProject ────────────────────────────────────────────────────────────

// ListByProject returns all approval requests for a project, newest first.
func (s *Service) ListByProject(ctx context.Context, projectID uuid.UUID) ([]*ApprovalRequest, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+approvalCols+`
		 FROM approval_requests
		 WHERE project_id = $1
		 ORDER BY created_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("approval: list by project: %w", err)
	}
	defer rows.Close()

	var result []*ApprovalRequest
	for rows.Next() {
		ar, err := scanApprovalRequest(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, ar)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("approval: list rows: %w", err)
	}
	return result, nil
}

// ─── ListPendingByWorkspace ───────────────────────────────────────────────────

// ListPendingByWorkspace returns pending approval requests across all projects
// in the workspace, ordered newest-first, capped at limit.
func (s *Service) ListPendingByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]PendingItem, error) {
	ids, err := s.projects.ListIDsForWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("approval: list project ids: %w", err)
	}
	if len(ids) == 0 {
		return nil, nil
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, created_at
		 FROM approval_requests
		 WHERE project_id = ANY($1) AND status = 'pending'
		 ORDER BY created_at DESC
		 LIMIT $2`,
		ids, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("approval: list pending by workspace: %w", err)
	}
	defer rows.Close()

	var result []PendingItem
	for rows.Next() {
		var item PendingItem
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("approval: scan pending item: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("approval: pending rows: %w", err)
	}
	return result, nil
}

// ─── Email ────────────────────────────────────────────────────────────────────

// sendApprovalEmail sends a plain-text notification to a recipient.
// Mirrors org.sendInviteEmail: unauthenticated SMTP, best-effort.
func (s *Service) sendApprovalEmail(to, projectName, description, aiReview string, requestID uuid.UUID) error {
	addr := fmt.Sprintf("%s:%s", s.cfg.SMTPHost, s.cfg.SMTPPort)
	from := s.cfg.SMTPFrom

	// Trim ai_review to a brief snippet.
	snippet := aiReview
	if len(snippet) > 200 {
		snippet = snippet[:200] + "..."
	}
	snippet = strings.TrimSpace(snippet)

	link := "/projects/" + requestID.String()

	msg := []byte(
		"From: " + from + "\r\n" +
			"To: " + to + "\r\n" +
			"Subject: Approval Request Pending: " + projectName + "\r\n" +
			"Content-Type: text/plain; charset=utf-8\r\n" +
			"\r\n" +
			"A new approval request requires your decision.\r\n\r\n" +
			"Project: " + projectName + "\r\n" +
			"Description:\r\n" + description + "\r\n\r\n" +
			"AI Review:\r\n" + snippet + "\r\n\r\n" +
			"Review and decide here:\r\n" +
			link + "\r\n",
	)

	return smtp.SendMail(addr, nil, from, []string{to}, msg)
}
