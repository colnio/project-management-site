// Package search implements the cross-workspace global search module: a single
// /v1/search endpoint that fans out over samples, experiments, projects, and
// people, scoped to projects the principal can read.
//
// Access control delegates entirely to project.Service.ListReadableProjects —
// the search module never bypasses project-visibility rules.
package search

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// Result is a single search hit returned to the client.
// JSON tags are exact — the frontend depends on them.
type Result struct {
	Type          string     `json:"type"`                      // "people" | "project" | "sample" | "experiment"
	ID            string     `json:"id"`
	Label         string     `json:"label"`                     // primary text
	Sublabel      string     `json:"sublabel"`                  // secondary text (kind/method/email/etc.)
	ProjectID     *uuid.UUID `json:"project_id,omitempty"`
	WorkspaceID   *uuid.UUID `json:"workspace_id,omitempty"`
	WorkspaceName string     `json:"workspace_name,omitempty"`
	Email         string     `json:"email,omitempty"`
	Kind          string     `json:"kind,omitempty"`
	Status        string     `json:"status,omitempty"`
	Method        string     `json:"method,omitempty"`
	Tier          int        `json:"tier"` // 0=current project, 1=current workspace, 2=elsewhere
}

// Service is the search module's domain service.
type Service struct {
	pool     *pgxpool.Pool
	projects *project.Service
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool, projects *project.Service) *Service {
	return &Service{
		pool:     pool,
		projects: projects,
	}
}

// Search fans out across samples, experiments, projects, and people for query q.
// currentProjectID may be nil (no project context). types may be nil/empty to
// query all four types. limit defaults to 8 per type (max 25).
func (s *Service) Search(
	ctx context.Context,
	p *platform.Principal,
	q string,
	currentProjectID *uuid.UUID,
	types []string,
	limit int,
) ([]*Result, error) {
	q = strings.TrimSpace(q)
	if len(q) == 0 {
		return []*Result{}, nil
	}
	if limit <= 0 || limit > 25 {
		limit = 8
	}

	// Determine requested types; nil/empty → all four.
	typeSet := make(map[string]bool)
	if len(types) > 0 {
		for _, t := range types {
			t = strings.TrimSpace(t)
			if t != "" {
				typeSet[t] = true
			}
		}
	}
	all := len(typeSet) == 0
	wants := func(t string) bool { return all || typeSet[t] }

	// ── Step 1: readable projects ────────────────────────────────────────────
	readable, err := s.projects.ListReadableProjects(ctx, p)
	if err != nil {
		return nil, fmt.Errorf("search: list readable projects: %w", err)
	}

	// Build helper maps.
	readableIDs := make([]uuid.UUID, 0, len(readable))
	wsByProject := make(map[uuid.UUID]uuid.UUID, len(readable))
	projNameByID := make(map[uuid.UUID]string, len(readable))
	wsIDSet := make(map[uuid.UUID]struct{})

	for _, rp := range readable {
		readableIDs = append(readableIDs, rp.ID)
		wsByProject[rp.ID] = rp.WorkspaceID
		projNameByID[rp.ID] = rp.Name
		wsIDSet[rp.WorkspaceID] = struct{}{}
	}

	// Collect distinct workspace IDs and load names.
	distinctWsIDs := make([]uuid.UUID, 0, len(wsIDSet))
	for wsID := range wsIDSet {
		distinctWsIDs = append(distinctWsIDs, wsID)
	}
	wsNameByID := make(map[uuid.UUID]string, len(distinctWsIDs))
	if len(distinctWsIDs) > 0 {
		rows, qerr := s.pool.Query(ctx,
			`SELECT id, name FROM workspaces WHERE id = ANY($1)`,
			distinctWsIDs,
		)
		if qerr != nil {
			return nil, fmt.Errorf("search: load workspace names: %w", qerr)
		}
		defer rows.Close()
		for rows.Next() {
			var wsID uuid.UUID
			var name string
			if serr := rows.Scan(&wsID, &name); serr != nil {
				return nil, fmt.Errorf("search: scan workspace name: %w", serr)
			}
			wsNameByID[wsID] = name
		}
		if rerr := rows.Err(); rerr != nil {
			return nil, fmt.Errorf("search: workspace names rows: %w", rerr)
		}
	}

	// Determine current workspace.
	var currentWorkspaceID *uuid.UUID
	if currentProjectID != nil {
		if wsID, ok := wsByProject[*currentProjectID]; ok {
			currentWorkspaceID = &wsID
		}
	}

	like := "%" + q + "%"
	var results []*Result

	// ── Step 2a: samples ─────────────────────────────────────────────────────
	if wants("sample") && len(readableIDs) > 0 {
		rows, qerr := s.pool.Query(ctx,
			`SELECT s.id, s.identifier, s.name, s.kind, s.status, s.project_id, p.workspace_id
			 FROM samples s
			 JOIN projects p ON p.id = s.project_id
			 WHERE s.project_id = ANY($1)
			   AND (s.identifier ILIKE $2 OR s.name ILIKE $2)
			 ORDER BY s.identifier
			 LIMIT $3`,
			readableIDs, like, limit,
		)
		if qerr != nil {
			return nil, fmt.Errorf("search: samples query: %w", qerr)
		}
		defer rows.Close()
		for rows.Next() {
			var id, projectID, workspaceID uuid.UUID
			var identifier, name, kind, status string
			if serr := rows.Scan(&id, &identifier, &name, &kind, &status, &projectID, &workspaceID); serr != nil {
				return nil, fmt.Errorf("search: samples scan: %w", serr)
			}
			label := identifier
			if name != "" {
				label = identifier + " — " + name
			}
			wsName := wsNameByID[workspaceID]
			r := &Result{
				Type:          "sample",
				ID:            id.String(),
				Label:         label,
				Sublabel:      kind,
				ProjectID:     &projectID,
				WorkspaceID:   &workspaceID,
				WorkspaceName: wsName,
				Kind:          kind,
				Status:        status,
				Tier:          tier(projectID, workspaceID, currentProjectID, currentWorkspaceID),
			}
			results = append(results, r)
		}
		if rerr := rows.Err(); rerr != nil {
			return nil, fmt.Errorf("search: samples rows: %w", rerr)
		}
	}

	// ── Step 2b: experiments ─────────────────────────────────────────────────
	if wants("experiment") && len(readableIDs) > 0 {
		rows, qerr := s.pool.Query(ctx,
			`SELECT e.id, COALESCE(e.code,''), e.method, e.result_summary, e.project_id, p.workspace_id
			 FROM experiments e
			 JOIN projects p ON p.id = e.project_id
			 WHERE e.project_id = ANY($1)
			   AND (COALESCE(e.code,'') ILIKE $2 OR e.method ILIKE $2 OR e.result_summary ILIKE $2)
			 ORDER BY e.code
			 LIMIT $3`,
			readableIDs, like, limit,
		)
		if qerr != nil {
			return nil, fmt.Errorf("search: experiments query: %w", qerr)
		}
		defer rows.Close()
		for rows.Next() {
			var id, projectID, workspaceID uuid.UUID
			var code, method, resultSummary string
			if serr := rows.Scan(&id, &code, &method, &resultSummary, &projectID, &workspaceID); serr != nil {
				return nil, fmt.Errorf("search: experiments scan: %w", serr)
			}
			label := code
			if label == "" {
				label = "Experiment"
			}
			wsName := wsNameByID[workspaceID]
			r := &Result{
				Type:          "experiment",
				ID:            id.String(),
				Label:         label,
				Sublabel:      method,
				ProjectID:     &projectID,
				WorkspaceID:   &workspaceID,
				WorkspaceName: wsName,
				Method:        method,
				Tier:          tier(projectID, workspaceID, currentProjectID, currentWorkspaceID),
			}
			results = append(results, r)
		}
		if rerr := rows.Err(); rerr != nil {
			return nil, fmt.Errorf("search: experiments rows: %w", rerr)
		}
	}

	// ── Step 2c: projects (in-memory filter over readable) ───────────────────
	if wants("project") {
		ql := strings.ToLower(q)
		count := 0
		for _, rp := range readable {
			if count >= limit {
				break
			}
			if !strings.Contains(strings.ToLower(rp.Name), ql) {
				continue
			}
			wsName := wsNameByID[rp.WorkspaceID]
			wsID := rp.WorkspaceID
			projID := rp.ID
			t := tierProject(projID, wsID, currentProjectID, currentWorkspaceID)
			results = append(results, &Result{
				Type:          "project",
				ID:            rp.ID.String(),
				Label:         rp.Name,
				Sublabel:      wsName,
				WorkspaceID:   &wsID,
				WorkspaceName: wsName,
				Tier:          t,
			})
			count++
		}
	}

	// ── Step 2d: people (global directory, no project filter) ────────────────
	if wants("people") {
		rows, qerr := s.pool.Query(ctx,
			`SELECT id, email,
			        COALESCE(NULLIF(display_name,''),''),
			        COALESCE(first_name,''),
			        COALESCE(last_name,'')
			 FROM users
			 WHERE status = 'approved'
			   AND (email ILIKE $1 OR display_name ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)
			 ORDER BY display_name NULLS LAST, email
			 LIMIT $2`,
			like, limit,
		)
		if qerr != nil {
			return nil, fmt.Errorf("search: people query: %w", qerr)
		}
		defer rows.Close()
		for rows.Next() {
			var id uuid.UUID
			var email, displayName, firstName, lastName string
			if serr := rows.Scan(&id, &email, &displayName, &firstName, &lastName); serr != nil {
				return nil, fmt.Errorf("search: people scan: %w", serr)
			}
			label := displayName
			if label == "" {
				full := strings.TrimSpace(firstName + " " + lastName)
				if full != "" {
					label = full
				} else {
					label = email
				}
			}
			results = append(results, &Result{
				Type:     "people",
				ID:       id.String(),
				Label:    label,
				Sublabel: email,
				Email:    email,
				Tier:     2,
			})
		}
		if rerr := rows.Err(); rerr != nil {
			return nil, fmt.Errorf("search: people rows: %w", rerr)
		}
	}

	// ── Step 3: sort by (tier asc, prefix match first, label asc) ────────────
	ql := strings.ToLower(q)
	sort.SliceStable(results, func(i, j int) bool {
		a, b := results[i], results[j]
		if a.Tier != b.Tier {
			return a.Tier < b.Tier
		}
		// Prefix matches rank above substring matches.
		aPrefix := strings.HasPrefix(strings.ToLower(a.Label), ql)
		bPrefix := strings.HasPrefix(strings.ToLower(b.Label), ql)
		if aPrefix != bPrefix {
			return aPrefix
		}
		return strings.ToLower(a.Label) < strings.ToLower(b.Label)
	})

	if results == nil {
		results = []*Result{}
	}
	return results, nil
}

// tier returns 0 if the result's project matches currentProjectID, 1 if its
// workspace matches currentWorkspaceID, 2 otherwise.
func tier(projectID, workspaceID uuid.UUID, currentProjectID *uuid.UUID, currentWorkspaceID *uuid.UUID) int {
	if currentProjectID != nil && projectID == *currentProjectID {
		return 0
	}
	if currentWorkspaceID != nil && workspaceID == *currentWorkspaceID {
		return 1
	}
	return 2
}

// tierProject is like tier but only considers the workspace dimension.
func tierProject(projectID, workspaceID uuid.UUID, currentProjectID *uuid.UUID, currentWorkspaceID *uuid.UUID) int {
	if currentProjectID != nil && projectID == *currentProjectID {
		return 0
	}
	if currentWorkspaceID != nil && workspaceID == *currentWorkspaceID {
		return 1
	}
	return 2
}
