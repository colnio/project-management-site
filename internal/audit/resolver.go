package audit

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ResourceContext holds the resolved project/workspace context for a single
// audit entry. All fields are optional; unresolved entries leave them blank.
type ResourceContext struct {
	ProjectID     string
	ProjectName   string
	WorkspaceName string
}

// contextResolver resolves resource_type+resource_id pairs to project/workspace
// context in a best-effort, non-failing manner. A per-request project cache
// (keyed by project UUID) prevents repeated DB round-trips for entries that
// share the same project.
type contextResolver struct {
	pool         *pgxpool.Pool
	projectCache map[uuid.UUID]*projectInfo // nil means "not found" was already cached
}

type projectInfo struct {
	name        string
	workspaceName string
}

func newContextResolver(pool *pgxpool.Pool) *contextResolver {
	return &contextResolver{
		pool:         pool,
		projectCache: make(map[uuid.UUID]*projectInfo),
	}
}

// Resolve returns the ResourceContext for a given resource_type and resource_id.
// It never returns an error; failures are silently swallowed and result in a
// zero ResourceContext so that they never fail the outer list request.
func (r *contextResolver) Resolve(ctx context.Context, resourceType, resourceID string) ResourceContext {
	id, err := uuid.Parse(resourceID)
	if err != nil {
		return ResourceContext{}
	}

	switch resourceType {
	case "project":
		return r.fromProject(ctx, id)

	case "workspace":
		name := r.lookupWorkspaceName(ctx, id)
		return ResourceContext{WorkspaceName: name}

	case "sample", "experiment", "iteration", "risk", "approval_request", "page", "artifact":
		projectID := r.lookupProjectID(ctx, resourceType, id)
		if projectID == uuid.Nil {
			return ResourceContext{}
		}
		return r.fromProject(ctx, projectID)

	default:
		return ResourceContext{}
	}
}

// fromProject resolves a project UUID to a full ResourceContext, using the
// in-request cache to avoid repeated queries.
func (r *contextResolver) fromProject(ctx context.Context, projectID uuid.UUID) ResourceContext {
	info, seen := r.projectCache[projectID]
	if !seen {
		info = r.lookupProject(ctx, projectID)
		r.projectCache[projectID] = info // may be nil (not found)
	}
	if info == nil {
		return ResourceContext{}
	}
	return ResourceContext{
		ProjectID:     projectID.String(),
		ProjectName:   info.name,
		WorkspaceName: info.workspaceName,
	}
}

// lookupProject fetches project name + workspace name for a project UUID.
// Returns nil when the project does not exist or the query fails.
func (r *contextResolver) lookupProject(ctx context.Context, id uuid.UUID) *projectInfo {
	var info projectInfo
	err := r.pool.QueryRow(ctx, `
		SELECT p.name, w.name
		FROM projects p
		JOIN workspaces w ON w.id = p.workspace_id
		WHERE p.id = $1`, id,
	).Scan(&info.name, &info.workspaceName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return nil // query error — treat same as not found
	}
	return &info
}

// lookupWorkspaceName fetches the name for a workspace UUID.
// Returns "" when not found or on error.
func (r *contextResolver) lookupWorkspaceName(ctx context.Context, id uuid.UUID) string {
	var name string
	err := r.pool.QueryRow(ctx, `SELECT name FROM workspaces WHERE id = $1`, id).Scan(&name)
	if err != nil {
		return ""
	}
	return name
}

// lookupProjectID resolves a child resource to its project_id by querying the
// appropriate table. Returns uuid.Nil when not found, on error, or for unknown
// resource types.
func (r *contextResolver) lookupProjectID(ctx context.Context, resourceType string, id uuid.UUID) uuid.UUID {
	table := resourceTypeTable(resourceType)
	if table == "" {
		return uuid.Nil
	}
	var projectID uuid.UUID
	// Safe: table name comes from our own switch, never from user input.
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM `+table+` WHERE id = $1`, id,
	).Scan(&projectID)
	if err != nil {
		return uuid.Nil
	}
	return projectID
}

// resourceTypeTable maps an audit resource_type to the Postgres table name.
// Returns "" for unknown types so the caller can bail early.
func resourceTypeTable(resourceType string) string {
	switch resourceType {
	case "sample":
		return "samples"
	case "experiment":
		return "experiments"
	case "iteration":
		return "iterations"
	case "approval_request":
		return "approval_requests"
	case "page":
		return "pages"
	case "artifact":
		return "artifacts"
	default:
		return ""
	}
}
