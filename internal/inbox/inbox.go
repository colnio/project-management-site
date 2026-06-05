// Package inbox implements the workspace Inbox aggregation endpoint: a
// read-only feed of actionable items from across the platform (flagged risks,
// proposed LLM actions, recent audit activity) scoped to a workspace.
//
// Data is fetched through the owning modules' public APIs (risk, ai, project) —
// there is no inbox table and no cross-module SQL. Items are capped at 50 and
// ordered newest-first. A failure in any source surfaces as an error rather than
// silently returning partial data.
package inbox

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/ai"
	"github.com/colnio/project-management-site/internal/approval"
	"github.com/colnio/project-management-site/internal/mention"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/risk"
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
	pool      *pgxpool.Pool
	org       *org.Service
	risks     *risk.Service
	ai        *ai.Service
	projects  *project.Service
	approvals *approval.Service
	mentions  *mention.Service
	log       *slog.Logger
}

// SetMentions wires the mention module as an inbox source (personal @-mentions).
func (s *Service) SetMentions(m *mention.Service) { s.mentions = m }

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool, orgSvc *org.Service, risks *risk.Service, aiSvc *ai.Service, projects *project.Service, approvals *approval.Service, log *slog.Logger) *Service {
	return &Service{
		pool:      pool,
		org:       orgSvc,
		risks:     risks,
		ai:        aiSvc,
		projects:  projects,
		approvals: approvals,
		log:       log,
	}
}

const inboxCap = 50

// AggregateForWorkspace collects inbox items from all sources for the
// given workspace and returns them newest-first, capped at inboxCap.
func (s *Service) AggregateForWorkspace(ctx context.Context, workspaceID, userID uuid.UUID) ([]Item, error) {
	var items []Item

	// Source 0: personal @-mentions for this user in this workspace.
	if s.mentions != nil {
		mentionItems, err := s.fetchMentions(ctx, workspaceID, userID)
		if err != nil {
			s.log.Warn("inbox: fetch mentions failed", "workspace_id", workspaceID, "err", err)
			return nil, err
		}
		items = append(items, mentionItems...)
	}

	// Source 1: flagged PI risks across projects in this workspace.
	piItems, err := s.fetchPIFlags(ctx, workspaceID)
	if err != nil {
		s.log.Warn("inbox: fetch pi flags failed", "workspace_id", workspaceID, "err", err)
		return nil, err
	}
	items = append(items, piItems...)

	// Source 2: proposed LLM tool calls (via conversations linked to workspace projects).
	aiItems, err := s.fetchAIProposals(ctx, workspaceID)
	if err != nil {
		s.log.Warn("inbox: fetch ai proposals failed", "workspace_id", workspaceID, "err", err)
		return nil, err
	}
	items = append(items, aiItems...)

	// Source 3: recent audit log entries for workspace resources.
	auditItems, err := s.fetchAuditItems(ctx, workspaceID)
	if err != nil {
		s.log.Warn("inbox: fetch audit items failed", "workspace_id", workspaceID, "err", err)
		return nil, err
	}
	items = append(items, auditItems...)

	// Source 4: pending approval requests across workspace projects.
	approvalItems, err := s.fetchPendingApprovals(ctx, workspaceID)
	if err != nil {
		s.log.Warn("inbox: fetch pending approvals failed", "workspace_id", workspaceID, "err", err)
		return nil, err
	}
	items = append(items, approvalItems...)

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

// ─── Source: personal @-mentions ──────────────────────────────────────────────

func (s *Service) fetchMentions(ctx context.Context, workspaceID, userID uuid.UUID) ([]Item, error) {
	// Mentions are a personal notification: a user should see every @-mention
	// addressed to them in their inbox, regardless of which workspace is
	// currently selected (mentions can be cross-workspace). Pass nil to fetch
	// across all workspaces rather than scoping to workspaceID.
	_ = workspaceID
	ms, err := s.mentions.ListForUser(ctx, userID, nil, inboxCap)
	if err != nil {
		return nil, fmt.Errorf("inbox: mentions: %w", err)
	}
	var items []Item
	for _, m := range ms {
		items = append(items, Item{
			ID:        m.ID,
			Kind:      "mention",
			Title:     "You were mentioned",
			Body:      m.Snippet,
			Link:      m.Link,
			CreatedAt: m.CreatedAt,
		})
	}
	return items, nil
}

// ─── Source: PI-flagged risks ─────────────────────────────────────────────────

func (s *Service) fetchPIFlags(ctx context.Context, workspaceID uuid.UUID) ([]Item, error) {
	risks, err := s.risks.ListFlaggedForPIReviewByWorkspace(ctx, workspaceID, inboxCap)
	if err != nil {
		return nil, fmt.Errorf("inbox: pi flags: %w", err)
	}

	var items []Item
	for _, r := range risks {
		items = append(items, Item{
			ID:        r.ID,
			Kind:      "pi_flag",
			Title:     "PI Review Required: " + r.Title,
			Body:      r.ImpactHeadline,
			Link:      "/projects/" + r.ProjectID.String(),
			CreatedAt: r.CreatedAt,
		})
	}
	return items, nil
}

// ─── Source: proposed LLM tool calls ─────────────────────────────────────────

func (s *Service) fetchAIProposals(ctx context.Context, workspaceID uuid.UUID) ([]Item, error) {
	proposals, err := s.ai.ListProposedToolCallsByWorkspace(ctx, workspaceID, inboxCap)
	if err != nil {
		return nil, fmt.Errorf("inbox: ai proposals: %w", err)
	}

	var items []Item
	for _, tc := range proposals {
		items = append(items, Item{
			ID:        tc.ID,
			Kind:      "ai_proposal",
			Title:     "LLM Action Pending Approval: " + tc.Tool,
			Body:      "An LLM-generated action requires your review before it is executed.",
			Link:      "/projects/" + tc.ProjectID.String(),
			CreatedAt: tc.CreatedAt,
		})
	}
	return items, nil
}

// ─── Source: recent audit log ─────────────────────────────────────────────────

func (s *Service) fetchAuditItems(ctx context.Context, wsID uuid.UUID) ([]Item, error) {
	// Fetch non-archived project IDs for the workspace via the project service
	// (avoids the uuid = text mismatch of the old inline subquery).
	projectIDs, err := s.projects.ListIDsForWorkspace(ctx, wsID)
	if err != nil {
		return nil, fmt.Errorf("inbox: audit fetch project ids: %w", err)
	}

	// Convert UUIDs to strings for comparison with resource_id (text column).
	projectIDStrs := make([]string, len(projectIDs))
	for i, id := range projectIDs {
		projectIDStrs[i] = id.String()
	}

	// Build a project ID -> name lookup for human-readable body strings.
	projectNames, err := s.projects.GetProjectNames(ctx, projectIDs)
	if err != nil {
		return nil, fmt.Errorf("inbox: audit fetch project names: %w", err)
	}

	// Fetch workspace name for workspace-scoped audit entries.
	ws, err := s.org.GetWorkspace(ctx, wsID)
	if err != nil {
		return nil, fmt.Errorf("inbox: audit fetch workspace: %w", err)
	}

	rows, err := s.pool.Query(ctx,
		`SELECT al.id, al.action, al.resource_type, al.resource_id, al.created_at
		 FROM audit_log al
		 WHERE (
		   (al.resource_type = 'workspace' AND al.resource_id = $1)
		   OR al.resource_id = ANY($2)
		 )
		 ORDER BY al.created_at DESC
		 LIMIT $3`,
		wsID.String(), projectIDStrs, inboxCap,
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

		// Build a human-readable body using resolved names where possible.
		body := resourceType + " " + resourceID
		switch resourceType {
		case "project":
			if rid, parseErr := uuid.Parse(resourceID); parseErr == nil {
				if name, ok := projectNames[rid]; ok {
					body = "project " + name
				}
			}
		case "workspace":
			body = "workspace " + ws.Name
		}

		items = append(items, Item{
			ID:        id,
			Kind:      "system",
			Title:     action,
			Body:      body,
			Link:      "",
			CreatedAt: createdAt,
		})
	}
	return items, rows.Err()
}

// ─── Source: pending approval requests ───────────────────────────────────────

func (s *Service) fetchPendingApprovals(ctx context.Context, workspaceID uuid.UUID) ([]Item, error) {
	pending, err := s.approvals.ListPendingByWorkspace(ctx, workspaceID, inboxCap)
	if err != nil {
		return nil, fmt.Errorf("inbox: pending approvals: %w", err)
	}

	var items []Item
	for _, pa := range pending {
		items = append(items, Item{
			ID:        pa.ID,
			Kind:      "approval",
			Title:     "Approval Request Pending",
			Body:      "A project approval request is awaiting your decision.",
			Link:      "/projects/" + pa.ProjectID.String(),
			CreatedAt: pa.CreatedAt,
		})
	}
	return items, nil
}
