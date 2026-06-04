// Package activity implements the workspace activity feed: a chronological
// event stream of entity changes scoped to projects the principal can access.
package activity

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// ActivityItem is a single event in the workspace activity feed.
type ActivityItem struct {
	ID         string     `json:"id"`
	Type       string     `json:"type"`   // project|iteration|sample|experiment|page|artifact|risk|task
	Action     string     `json:"action"` // e.g. sample.create, page.update, task.status_change
	EntityID   string     `json:"entity_id"`
	ProjectID  uuid.UUID  `json:"project_id"`
	Title      string     `json:"title"`
	ActorID    *uuid.UUID `json:"actor_id,omitempty"`
	ActorName  string     `json:"actor_name"`
	FromStatus *string    `json:"from_status,omitempty"`
	ToStatus   *string    `json:"to_status,omitempty"`
	Reason     string     `json:"reason,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// Service is the activity module's domain service.
type Service struct {
	pool     *pgxpool.Pool
	projects *project.Service
	org      *org.Service
	log      *slog.Logger
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool, projects *project.Service, org *org.Service, log *slog.Logger) *Service {
	return &Service{
		pool:     pool,
		projects: projects,
		org:      org,
		log:      log,
	}
}

// subqueries returns the list of UNION ALL subquery strings, each selecting the
// same 12-column shape:
//
//	id text, type text, action text, entity_id text, project_id uuid,
//	title text, actor_id uuid, actor_name text,
//	from_status text, to_status text, reason text, created_at timestamptz
//
// All subqueries share params: $1 uuid[], $2 timestamptz (nullable), $3 int.
func buildQuery() string {
	subs := []string{
		// ── project ──────────────────────────────────────────────────────────
		`SELECT a.id::text, 'project', a.action, pr.id::text, pr.id,
		        pr.name AS title,
		        a.actor, COALESCE(NULLIF(u.display_name,''), u.email, '') AS actor_name,
		        NULL::text, NULL::text, ''::text, a.created_at
		 FROM audit_log a
		 JOIN projects pr ON a.resource_type = 'project' AND a.resource_id = pr.id::text
		 LEFT JOIN users u ON u.id = a.actor
		 WHERE pr.id = ANY($1)
		   AND ($2::timestamptz IS NULL OR a.created_at < $2)
		 ORDER BY a.created_at DESC LIMIT $3`,

		// ── iteration ────────────────────────────────────────────────────────
		`SELECT a.id::text, 'iteration', a.action, it.id::text, it.project_id,
		        it.title AS title,
		        a.actor, COALESCE(NULLIF(u.display_name,''), u.email, '') AS actor_name,
		        NULL::text, NULL::text, ''::text, a.created_at
		 FROM audit_log a
		 JOIN iterations it ON a.resource_type = 'iteration' AND a.resource_id = it.id::text
		 LEFT JOIN users u ON u.id = a.actor
		 WHERE it.project_id = ANY($1)
		   AND ($2::timestamptz IS NULL OR a.created_at < $2)
		 ORDER BY a.created_at DESC LIMIT $3`,

		// ── sample ───────────────────────────────────────────────────────────
		`SELECT a.id::text, 'sample', a.action, s.id::text, s.project_id,
		        COALESCE(NULLIF(s.name,''), s.identifier) AS title,
		        a.actor, COALESCE(NULLIF(u.display_name,''), u.email, '') AS actor_name,
		        NULL::text, NULL::text, ''::text, a.created_at
		 FROM audit_log a
		 JOIN samples s ON a.resource_type = 'sample' AND a.resource_id = s.id::text
		 LEFT JOIN users u ON u.id = a.actor
		 WHERE s.project_id = ANY($1)
		   AND ($2::timestamptz IS NULL OR a.created_at < $2)
		 ORDER BY a.created_at DESC LIMIT $3`,

		// ── experiment ───────────────────────────────────────────────────────
		`SELECT a.id::text, 'experiment', a.action, e.id::text, e.project_id,
		        COALESCE(e.code, 'Experiment') AS title,
		        a.actor, COALESCE(NULLIF(u.display_name,''), u.email, '') AS actor_name,
		        NULL::text, NULL::text, ''::text, a.created_at
		 FROM audit_log a
		 JOIN experiments e ON a.resource_type = 'experiment' AND a.resource_id = e.id::text
		 LEFT JOIN users u ON u.id = a.actor
		 WHERE e.project_id = ANY($1)
		   AND ($2::timestamptz IS NULL OR a.created_at < $2)
		 ORDER BY a.created_at DESC LIMIT $3`,

		// ── page ─────────────────────────────────────────────────────────────
		`SELECT a.id::text, 'page', a.action, pg.id::text, pg.project_id,
		        COALESCE(NULLIF(rv.label,''), 'Page') AS title,
		        a.actor, COALESCE(NULLIF(u.display_name,''), u.email, '') AS actor_name,
		        NULL::text, NULL::text, ''::text, a.created_at
		 FROM audit_log a
		 JOIN pages pg ON a.resource_type = 'page' AND a.resource_id = pg.id::text
		 LEFT JOIN page_revisions rv ON rv.id = pg.current_revision_id
		 LEFT JOIN users u ON u.id = a.actor
		 WHERE pg.project_id = ANY($1)
		   AND ($2::timestamptz IS NULL OR a.created_at < $2)
		 ORDER BY a.created_at DESC LIMIT $3`,

		// ── artifact ─────────────────────────────────────────────────────────
		`SELECT a.id::text, 'artifact', a.action, af.id::text, af.project_id,
		        af.filename AS title,
		        a.actor, COALESCE(NULLIF(u.display_name,''), u.email, '') AS actor_name,
		        NULL::text, NULL::text, ''::text, a.created_at
		 FROM audit_log a
		 JOIN artifacts af ON a.resource_type = 'artifact' AND a.resource_id = af.id::text
		 LEFT JOIN users u ON u.id = a.actor
		 WHERE af.project_id = ANY($1)
		   AND ($2::timestamptz IS NULL OR a.created_at < $2)
		 ORDER BY a.created_at DESC LIMIT $3`,

		// ── risk ─────────────────────────────────────────────────────────────
		`SELECT a.id::text, 'risk', a.action, rk.id::text, rk.project_id,
		        rk.title AS title,
		        a.actor, COALESCE(NULLIF(u.display_name,''), u.email, '') AS actor_name,
		        NULL::text, NULL::text, ''::text, a.created_at
		 FROM audit_log a
		 JOIN risks rk ON a.resource_type = 'risk' AND a.resource_id = rk.id::text
		 LEFT JOIN users u ON u.id = a.actor
		 WHERE rk.project_id = ANY($1)
		   AND ($2::timestamptz IS NULL OR a.created_at < $2)
		 ORDER BY a.created_at DESC LIMIT $3`,

		// ── task (from task_progress, not audit_log) ──────────────────────────
		`SELECT tp.id::text, 'task', 'task.'||tp.event_type, t.id::text, t.project_id,
		        t.title AS title,
		        tp.author_id, COALESCE(NULLIF(u.display_name,''), u.email, '') AS actor_name,
		        tp.from_status, tp.to_status, tp.reason, tp.created_at
		 FROM task_progress tp
		 JOIN tasks t ON t.id = tp.task_id
		 LEFT JOIN users u ON u.id = tp.author_id
		 WHERE t.project_id = ANY($1)
		   AND ($2::timestamptz IS NULL OR tp.created_at < $2)
		 ORDER BY tp.created_at DESC LIMIT $3`,
	}

	// Each subquery carries its own ORDER BY/LIMIT, so it must be parenthesized
	// before UNION ALL (Postgres rejects a bare ORDER BY between union members).
	for i, s := range subs {
		subs[i] = "(" + s + ")"
	}
	return `SELECT * FROM (` +
		strings.Join(subs, "\nUNION ALL\n") +
		`) feed ORDER BY created_at DESC LIMIT $3`
}

// ListForWorkspace returns a per-workspace activity feed, newest-first, for all
// projects the principal can read. Accepts an optional cursor (before) for
// pagination.
func (s *Service) ListForWorkspace(
	ctx context.Context,
	p *platform.Principal,
	workspaceID uuid.UUID,
	limit int,
	before *time.Time,
) ([]*ActivityItem, error) {
	// Fetch only projects the principal can access (access-filtered).
	projs, err := s.projects.ListProjectsForWorkspace(ctx, p, workspaceID, false)
	if err != nil {
		return nil, fmt.Errorf("activity: list projects: %w", err)
	}

	accessible := make([]uuid.UUID, 0, len(projs))
	for _, proj := range projs {
		accessible = append(accessible, proj.ID)
	}
	if len(accessible) == 0 {
		return []*ActivityItem{}, nil
	}

	if limit <= 0 || limit > 100 {
		limit = 40
	}

	query := buildQuery()

	rows, err := s.pool.Query(ctx, query, accessible, before, limit)
	if err != nil {
		return nil, fmt.Errorf("activity: query: %w", err)
	}
	defer rows.Close()

	items, err := collectRows(rows)
	if err != nil {
		return nil, fmt.Errorf("activity: scan: %w", err)
	}
	return items, nil
}

// collectRows scans pgx.Rows into a []*ActivityItem slice.
func collectRows(rows pgx.Rows) ([]*ActivityItem, error) {
	var items []*ActivityItem
	for rows.Next() {
		var item ActivityItem
		var actorID *uuid.UUID
		var fromStatus, toStatus *string

		if err := rows.Scan(
			&item.ID,
			&item.Type,
			&item.Action,
			&item.EntityID,
			&item.ProjectID,
			&item.Title,
			&actorID,
			&item.ActorName,
			&fromStatus,
			&toStatus,
			&item.Reason,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}

		item.ActorID = actorID
		item.FromStatus = fromStatus
		item.ToStatus = toStatus
		items = append(items, &item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if items == nil {
		return []*ActivityItem{}, nil
	}
	return items, nil
}
