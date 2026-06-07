// Package project implements the Project module (B1): project CRUD,
// visibility-aware access control, and the collaborator management API.
// It is the foundation for all research-data modules (B2–B6) which call
// GetProject and Authorize to resolve access before acting.
package project

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Project is the core domain struct. SummaryPageID has no FK — the page
// module owns the pages table; integrity is maintained at the application level.
type Project struct {
	ID             uuid.UUID  `json:"id"`
	WorkspaceID    uuid.UUID  `json:"workspace_id"`
	Name           string     `json:"name"`
	Description    string     `json:"description"`
	Visibility     string     `json:"visibility"`
	SummaryPageID  *uuid.UUID `json:"summary_page_id,omitempty"`
	CreatedBy      uuid.UUID  `json:"created_by"`
	OwnerID        uuid.UUID  `json:"owner_id"`
	ArchivedAt     *time.Time `json:"archived_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// UserLookup is the narrow interface the project service needs from auth.
type UserLookup interface {
	GetUserByEmail(ctx context.Context, email string) (*auth.User, error)
}

// Service is the project module's domain service.
type Service struct {
	pool *pgxpool.Pool
	org  *org.Service
	auth UserLookup
	rec  audit.Recorder
	log  *slog.Logger
}

// NewService constructs a Service.
func NewService(
	pool *pgxpool.Pool,
	orgSvc *org.Service,
	users UserLookup,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool: pool,
		org:  orgSvc,
		auth: users,
		rec:  rec,
		log:  log,
	}
}

// ─── Core domain API ─────────────────────────────────────────────────────────

// GetProject loads a project by id. Returns platform.NotFound if absent.
// Archived projects are returned normally — callers decide how to treat them.
func (s *Service) GetProject(ctx context.Context, id uuid.UUID) (*Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, name, description, visibility,
		        summary_page_id, created_by, owner_id, archived_at, created_at, updated_at
		 FROM projects WHERE id = $1`,
		id,
	).Scan(
		&p.ID, &p.WorkspaceID, &p.Name, &p.Description, &p.Visibility,
		&p.SummaryPageID, &p.CreatedBy, &p.OwnerID, &p.ArchivedAt, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("project.not_found", "project not found")
	}
	if err != nil {
		return nil, fmt.Errorf("project: get project: %w", err)
	}
	return &p, nil
}

// Authorize loads the project, resolves the principal's effective role via org,
// and returns platform.Forbidden if the role is below `need`. It returns the
// loaded project (so callers get workspace_id/visibility) and the resolved role.
// Downstream modules (B2–B6) should call this at the top of every handler.
func (s *Service) Authorize(
	ctx context.Context,
	p *platform.Principal,
	projectID uuid.UUID,
	need org.Role,
) (*Project, org.Role, error) {
	proj, err := s.GetProject(ctx, projectID)
	if err != nil {
		return nil, org.RoleNone, err
	}

	role, err := s.org.ResolveAccessForPrincipal(ctx, p, proj.WorkspaceID, proj.Visibility, &proj.ID)
	if err != nil {
		return nil, org.RoleNone, fmt.Errorf("project: resolve access: %w", err)
	}

	// The project owner of record always has full manage rights, regardless of
	// visibility or collaborator rows.
	if p != nil && p.UserID == proj.OwnerID {
		role = org.RoleOwner
	}

	// Check whether the resolved role satisfies the requirement.
	var sufficient bool
	switch need {
	case org.RoleViewer:
		sufficient = role.CanRead()
	case org.RoleEditor:
		sufficient = role.CanWrite()
	case org.RoleOwner:
		sufficient = role.CanManage()
	default:
		sufficient = role.CanRead()
	}

	if !sufficient {
		return nil, role, platform.Forbidden("insufficient access to this project")
	}
	return proj, role, nil
}

// ─── Project CRUD ─────────────────────────────────────────────────────────────

// CreateProject inserts a new project. The caller must already be verified as
// a workspace member. If visibility is "private", the creator is also added as
// an owner collaborator (so they can see their own private project).
func (s *Service) CreateProject(
	ctx context.Context,
	workspaceID uuid.UUID,
	name, description, visibility string,
	creatorID uuid.UUID,
) (*Project, error) {
	if visibility == "" {
		visibility = "workspace"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("project: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var proj Project
	err = tx.QueryRow(ctx,
		`INSERT INTO projects (workspace_id, name, description, visibility, created_by, owner_id)
		 VALUES ($1, $2, $3, $4, $5, $5)
		 RETURNING id, workspace_id, name, description, visibility,
		           summary_page_id, created_by, owner_id, archived_at, created_at, updated_at`,
		workspaceID, name, description, visibility, creatorID,
	).Scan(
		&proj.ID, &proj.WorkspaceID, &proj.Name, &proj.Description, &proj.Visibility,
		&proj.SummaryPageID, &proj.CreatedBy, &proj.OwnerID, &proj.ArchivedAt, &proj.CreatedAt, &proj.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("project: create project: %w", err)
	}

	if visibility == "private" {
		_, err = tx.Exec(ctx,
			`INSERT INTO project_collaborations (project_id, user_id, role) VALUES ($1, $2, $3)
			 ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
			proj.ID, creatorID, string(org.RoleOwner),
		)
		if err != nil {
			return nil, fmt.Errorf("project: add owner collaborator: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("project: commit create project: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        creatorID,
		Action:       "project.create",
		ResourceType: "project",
		ResourceID:   proj.ID.String(),
	})

	return &proj, nil
}

// ListProjectsForWorkspace returns all projects in the workspace the caller can
// read. Workspace-visible projects are visible to any member; private projects
// are visible only if the caller has a collaborator entry. Archived projects are
// excluded unless includeArchived is true.
func (s *Service) ListProjectsForWorkspace(
	ctx context.Context,
	p *platform.Principal,
	workspaceID uuid.UUID,
	includeArchived bool,
) ([]*Project, error) {
	query := `SELECT id, workspace_id, name, description, visibility,
	                 summary_page_id, created_by, owner_id, archived_at, created_at, updated_at
	          FROM projects
	          WHERE workspace_id = $1`
	args := []any{workspaceID}

	if !includeArchived {
		query += " AND archived_at IS NULL"
	}
	query += " ORDER BY created_at"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("project: list projects: %w", err)
	}
	defer rows.Close()

	var all []*Project
	var accessInputs []org.ProjectAccessInput
	for rows.Next() {
		var proj Project
		if err := rows.Scan(
			&proj.ID, &proj.WorkspaceID, &proj.Name, &proj.Description, &proj.Visibility,
			&proj.SummaryPageID, &proj.CreatedBy, &proj.OwnerID, &proj.ArchivedAt, &proj.CreatedAt, &proj.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("project: scan project: %w", err)
		}
		all = append(all, &proj)
		accessInputs = append(accessInputs, org.ProjectAccessInput{
			ProjectID:  proj.ID,
			Visibility: proj.Visibility,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("project: rows error: %w", err)
	}

	roles, err := s.org.ResolveAccessForProjects(ctx, p, workspaceID, accessInputs)
	if err != nil {
		return nil, fmt.Errorf("project: resolve access: %w", err)
	}

	var result []*Project
	for _, proj := range all {
		if roles[proj.ID].CanRead() {
			result = append(result, proj)
		}
	}
	return result, nil
}

// ReadableProject is a project the caller can read, paired with its workspace —
// used by cross-workspace search / @-mention features.
type ReadableProject struct {
	ID          uuid.UUID
	WorkspaceID uuid.UUID
	Name        string
	Visibility  string
}

// ListReadableProjects returns every non-archived project across all workspaces
// the principal can read. It composes the same per-workspace access resolution as
// ListProjectsForWorkspace: privileged users and lab members see all workspaces
// (workspace-visible projects everywhere; private only where they collaborate),
// while others see their member workspaces.
//
// Note: a pure external collaborator who is a member of no workspace (only a
// project_collaborations entry) is not enumerated here, mirroring the existing
// workspace-listing behaviour.
func (s *Service) ListReadableProjects(ctx context.Context, p *platform.Principal) ([]ReadableProject, error) {
	var workspaces []*org.Workspace
	var err error
	if p.IsPrivileged() || s.org.IsLabMember(p) {
		workspaces, err = s.org.ListAllWorkspaces(ctx)
	} else {
		workspaces, err = s.org.ListWorkspacesForUser(ctx, p.UserID)
	}
	if err != nil {
		return nil, fmt.Errorf("project: list readable: workspaces: %w", err)
	}

	var out []ReadableProject
	for _, ws := range workspaces {
		projs, perr := s.ListProjectsForWorkspace(ctx, p, ws.ID, false)
		if perr != nil {
			return nil, fmt.Errorf("project: list readable: workspace %s: %w", ws.ID, perr)
		}
		for _, pr := range projs {
			out = append(out, ReadableProject{
				ID:          pr.ID,
				WorkspaceID: pr.WorkspaceID,
				Name:        pr.Name,
				Visibility:  pr.Visibility,
			})
		}
	}
	return out, nil
}

// UpdateProject applies partial updates (non-empty fields only).
func (s *Service) UpdateProject(
	ctx context.Context,
	id uuid.UUID,
	name, description, visibility string,
	actorID uuid.UUID,
) (*Project, error) {
	var proj Project
	err := s.pool.QueryRow(ctx,
		`UPDATE projects
		 SET name        = CASE WHEN $2 != '' THEN $2 ELSE name END,
		     description = CASE WHEN $3 != '' THEN $3 ELSE description END,
		     visibility  = CASE WHEN $4 != '' THEN $4 ELSE visibility END,
		     updated_at  = now()
		 WHERE id = $1
		 RETURNING id, workspace_id, name, description, visibility,
		           summary_page_id, created_by, owner_id, archived_at, created_at, updated_at`,
		id, name, description, visibility,
	).Scan(
		&proj.ID, &proj.WorkspaceID, &proj.Name, &proj.Description, &proj.Visibility,
		&proj.SummaryPageID, &proj.CreatedBy, &proj.OwnerID, &proj.ArchivedAt, &proj.CreatedAt, &proj.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("project.not_found", "project not found")
	}
	if err != nil {
		return nil, fmt.Errorf("project: update project: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "project.update",
		ResourceType: "project",
		ResourceID:   proj.ID.String(),
	})

	return &proj, nil
}

// GetProjectNames returns id→name for the given project IDs. Missing IDs are
// omitted. An empty ids slice returns an empty map.
func (s *Service) GetProjectNames(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	if len(ids) == 0 {
		return map[uuid.UUID]string{}, nil
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, name FROM projects WHERE id = ANY($1)`,
		ids,
	)
	if err != nil {
		return nil, fmt.Errorf("project: get project names: %w", err)
	}
	defer rows.Close()

	out := make(map[uuid.UUID]string, len(ids))
	for rows.Next() {
		var id uuid.UUID
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, fmt.Errorf("project: scan project name: %w", err)
		}
		out[id] = name
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("project: get project names rows: %w", err)
	}
	return out, nil
}

// ListIDsForWorkspace returns the UUIDs of non-archived projects in the workspace.
func (s *Service) ListIDsForWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id FROM projects
		 WHERE workspace_id = $1
		   AND archived_at IS NULL`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("project: list ids for workspace: %w", err)
	}
	defer rows.Close()

	var result []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("project: scan project id: %w", err)
		}
		result = append(result, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("project: rows error (ids): %w", err)
	}
	return result, nil
}

// ArchiveProject sets archived_at to now().
func (s *Service) ArchiveProject(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (*Project, error) {
	var proj Project
	err := s.pool.QueryRow(ctx,
		`UPDATE projects
		 SET archived_at = now(), updated_at = now()
		 WHERE id = $1 AND archived_at IS NULL
		 RETURNING id, workspace_id, name, description, visibility,
		           summary_page_id, created_by, owner_id, archived_at, created_at, updated_at`,
		id,
	).Scan(
		&proj.ID, &proj.WorkspaceID, &proj.Name, &proj.Description, &proj.Visibility,
		&proj.SummaryPageID, &proj.CreatedBy, &proj.OwnerID, &proj.ArchivedAt, &proj.CreatedAt, &proj.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		// Either not found or already archived — load to distinguish.
		existing, getErr := s.GetProject(ctx, id)
		if getErr != nil {
			return nil, getErr
		}
		// Already archived — return it as-is (idempotent).
		return existing, nil
	}
	if err != nil {
		return nil, fmt.Errorf("project: archive project: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "project.archive",
		ResourceType: "project",
		ResourceID:   proj.ID.String(),
	})

	return &proj, nil
}

// ─── TransferOwnership ─────────────────────────────────────────────────────────

// TransferOwnership reassigns the project owner of record to newOwnerID. The new
// owner is granted the owner collaborator role and the previous owner is demoted
// to editor. The new owner must already have a path to the project (be a member
// of its workspace or an existing collaborator).
func (s *Service) TransferOwnership(ctx context.Context, projectID, newOwnerID, actorID uuid.UUID) (*Project, error) {
	proj, err := s.GetProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if proj.OwnerID == newOwnerID {
		return proj, nil // already the owner — no-op
	}

	// The new owner must be able to access this project.
	_, isMember, err := s.org.WorkspaceRole(ctx, proj.WorkspaceID, newOwnerID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		_, isCollab, cerr := s.org.CollaboratorRole(ctx, projectID, newOwnerID)
		if cerr != nil {
			return nil, cerr
		}
		if !isCollab {
			return nil, platform.BadRequest("project.owner_not_member",
				"the new owner must be a member of the workspace or a project collaborator")
		}
	}

	prevOwnerID := proj.OwnerID

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("project: transfer ownership: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var updated Project
	err = tx.QueryRow(ctx,
		`UPDATE projects SET owner_id = $2, updated_at = now()
		 WHERE id = $1
		 RETURNING id, workspace_id, name, description, visibility,
		           summary_page_id, created_by, owner_id, archived_at, created_at, updated_at`,
		projectID, newOwnerID,
	).Scan(
		&updated.ID, &updated.WorkspaceID, &updated.Name, &updated.Description, &updated.Visibility,
		&updated.SummaryPageID, &updated.CreatedBy, &updated.OwnerID, &updated.ArchivedAt, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("project: transfer ownership: update: %w", err)
	}

	// Grant the new owner the owner collaborator role.
	if _, err := tx.Exec(ctx,
		`INSERT INTO project_collaborations (project_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		projectID, newOwnerID, string(org.RoleOwner),
	); err != nil {
		return nil, fmt.Errorf("project: transfer ownership: grant owner: %w", err)
	}

	// Demote the previous owner to editor.
	if _, err := tx.Exec(ctx,
		`INSERT INTO project_collaborations (project_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		projectID, prevOwnerID, string(org.RoleEditor),
	); err != nil {
		return nil, fmt.Errorf("project: transfer ownership: demote previous owner: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("project: transfer ownership: commit: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "project.transfer_ownership",
		ResourceType: "project",
		ResourceID:   projectID.String(),
	})

	return &updated, nil
}
