// Package inbox implements the workspace Inbox aggregation endpoint: a
// read-only feed of actionable items from across the platform (flagged risks,
// proposed AI actions, recent audit activity) scoped to a workspace.
//
// All data is fetched with simple JOINs — there is no inbox table. Items are
// capped at 50 and ordered newest-first. The endpoint is best-effort: if one
// source query fails the error is logged and the aggregation continues.
package inbox

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/org"
)

// Item is a single inbox entry returned to the client.
type Item struct {
	ID        uuid.UUID `json:"id"`
	Kind      string    `json:"kind"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Link      string    `json:"link"`
	CreatedAt time.Time `json:"created_at"`
}

// Service is the inbox module's domain service.
type Service struct {
	pool *pgxpool.Pool
	org  *org.Service
	log  *slog.Logger
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool, orgSvc *org.Service, log *slog.Logger) *Service {
	return &Service{
		pool: pool,
		org:  orgSvc,
		log:  log,
	}
}

const inboxCap = 50

// AggregateForWorkspace collects inbox items from all sources for the
// given workspace and returns them newest-first, capped at inboxCap.
func (s *Service) AggregateForWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]Item, error) {
	var items []Item

	// Source 1: flagged PI risks across projects in this workspace.
	piItems, err := s.fetchPIFlags(ctx, workspaceID)
	if err != nil {
		s.log.Warn("inbox: fetch pi flags failed", "workspace_id", workspaceID, "err", err)
	} else {
		items = append(items, piItems...)
	}

	// Source 2: proposed AI tool calls (via conversations linked to workspace projects).
	aiItems, err := s.fetchAIProposals(ctx, workspaceID)
	if err != nil {
		s.log.Warn("inbox: fetch ai proposals failed", "workspace_id", workspaceID, "err", err)
	} else {
		items = append(items, aiItems...)
	}

	// Source 3: recent audit log entries for workspace resources.
	auditItems, err := s.fetchAuditItems(ctx, workspaceID)
	if err != nil {
		s.log.Warn("inbox: fetch audit items failed", "workspace_id", workspaceID, "err", err)
	} else {
		items = append(items, auditItems...)
	}

	// Sort newest-first and cap.
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	if len(items) > inboxCap {
		items = items[:inboxCap]
	}
	if items == nil {
		items = []Item{}
	}
	return items, nil
}

// ─── Source: PI-flagged risks ─────────────────────────────────────────────────

func (s *Service) fetchPIFlags(ctx context.Context, workspaceID uuid.UUID) ([]Item, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT r.id, r.title, r.impact_headline, r.project_id, r.created_at
		 FROM risks r
		 JOIN projects p ON p.id = r.project_id
		 WHERE p.workspace_id = $1
		   AND r.flagged_for_pi_review = true
		 ORDER BY r.created_at DESC
		 LIMIT $2`,
		workspaceID, inboxCap,
	)
	if err != nil {
		return nil, fmt.Errorf("inbox: pi flags query: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var id, projectID uuid.UUID
		var title, impactHeadline string
		var createdAt time.Time
		if err := rows.Scan(&id, &title, &impactHeadline, &projectID, &createdAt); err != nil {
			return nil, fmt.Errorf("inbox: pi flags scan: %w", err)
		}
		items = append(items, Item{
			ID:        id,
			Kind:      "pi_flag",
			Title:     "PI Review Required: " + title,
			Body:      impactHeadline,
			Link:      "/projects/" + projectID.String(),
			CreatedAt: createdAt,
		})
	}
	return items, rows.Err()
}

// ─── Source: proposed AI tool calls ──────────────────────────────────────────

func (s *Service) fetchAIProposals(ctx context.Context, workspaceID uuid.UUID) ([]Item, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT tc.id, tc.tool, tc.created_at, p.id AS project_id
		 FROM ai_tool_calls tc
		 JOIN ai_conversations c ON c.id = tc.conversation_id
		 JOIN projects p ON p.id = c.project_id
		 WHERE p.workspace_id = $1
		   AND tc.status = 'proposed'
		 ORDER BY tc.created_at DESC
		 LIMIT $2`,
		workspaceID, inboxCap,
	)
	if err != nil {
		return nil, fmt.Errorf("inbox: ai proposals query: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var id, projectID uuid.UUID
		var tool string
		var createdAt time.Time
		if err := rows.Scan(&id, &tool, &createdAt, &projectID); err != nil {
			return nil, fmt.Errorf("inbox: ai proposals scan: %w", err)
		}
		items = append(items, Item{
			ID:        id,
			Kind:      "ai_proposal",
			Title:     "AI Action Pending Approval: " + tool,
			Body:      "An AI-generated action requires your review before it is executed.",
			Link:      "/projects/" + projectID.String(),
			CreatedAt: createdAt,
		})
	}
	return items, rows.Err()
}

// ─── Source: recent audit log ─────────────────────────────────────────────────

func (s *Service) fetchAuditItems(ctx context.Context, workspaceID uuid.UUID) ([]Item, error) {
	// We gather audit_log entries where the resource_id matches a project in
	// this workspace, or resource_type is 'workspace' and resource_id matches.
	rows, err := s.pool.Query(ctx,
		`SELECT al.id, al.action, al.resource_type, al.resource_id, al.created_at
		 FROM audit_log al
		 WHERE (
		   (al.resource_type = 'workspace' AND al.resource_id = $1::text)
		   OR al.resource_id IN (
		       SELECT id::text FROM projects WHERE workspace_id = $1
		   )
		 )
		 ORDER BY al.created_at DESC
		 LIMIT $2`,
		workspaceID, inboxCap,
	)
	if err != nil {
		return nil, fmt.Errorf("inbox: audit query: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var id uuid.UUID
		var action, resourceType, resourceID string
		var createdAt time.Time
		if err := rows.Scan(&id, &action, &resourceType, &resourceID, &createdAt); err != nil {
			return nil, fmt.Errorf("inbox: audit scan: %w", err)
		}
		items = append(items, Item{
			ID:        id,
			Kind:      "system",
			Title:     action,
			Body:      resourceType + " " + resourceID,
			Link:      "",
			CreatedAt: createdAt,
		})
	}
	return items, rows.Err()
}
