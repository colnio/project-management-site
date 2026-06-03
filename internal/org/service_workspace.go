package org

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// ─── Workspace CRUD ──────────────────────────────────────────────────────────

// CreateWorkspace creates a new workspace and adds the creator as owner.
func (s *Service) CreateWorkspace(ctx context.Context, name string, creatorID uuid.UUID) (*Workspace, error) {
	slug, err := s.uniqueSlug(ctx, slugify(name))
	if err != nil {
		return nil, fmt.Errorf("org: generate slug: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("org: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var ws Workspace
	err = tx.QueryRow(ctx,
		`INSERT INTO workspaces (name, slug, created_by)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, slug, created_by, created_at, updated_at`,
		name, slug, creatorID,
	).Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.CreatedBy, &ws.CreatedAt, &ws.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("org: create workspace: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
		ws.ID, creatorID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: add owner membership: %w", err)
	}

	// Seed the workspace's AI autonomy at 'full' so AI assistance can write
	// without a per-action approval click. The allow-list scopes auto-execution
	// to the interactive Risk Assessment's Phase-6 finalizer (save_risk_assessment);
	// any other write tool still falls back to "propose for approval" under full
	// mode, keeping a human in the loop for everything except the RA write.
	// Owners can broaden or restrict this later in settings. ON CONFLICT guards
	// re-seeding.
	_, err = tx.Exec(ctx,
		`INSERT INTO autonomy_configs (scope, scope_id, mode, allowed_tools)
		 VALUES ('workspace', $1, 'full', ARRAY['save_risk_assessment'])
		 ON CONFLICT (scope, scope_id) DO NOTHING`,
		ws.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: seed workspace autonomy: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("org: commit workspace creation: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        creatorID,
		Action:       "workspace.create",
		ResourceType: "workspace",
		ResourceID:   ws.ID.String(),
	})

	return &ws, nil
}

// GetWorkspace returns a workspace by ID, or platform.NotFound if absent.
func (s *Service) GetWorkspace(ctx context.Context, id uuid.UUID) (*Workspace, error) {
	var ws Workspace
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, slug, created_by, created_at, updated_at FROM workspaces WHERE id=$1`,
		id,
	).Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.CreatedBy, &ws.CreatedAt, &ws.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("workspace.not_found", "workspace not found")
	}
	if err != nil {
		return nil, fmt.Errorf("org: get workspace: %w", err)
	}
	return &ws, nil
}

// ListWorkspacesForUser returns all workspaces the user is a member of.
func (s *Service) ListWorkspacesForUser(ctx context.Context, userID uuid.UUID) ([]*Workspace, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT w.id, w.name, w.slug, w.created_by, w.created_at, w.updated_at
		 FROM workspaces w
		 JOIN workspace_memberships m ON m.workspace_id = w.id
		 WHERE m.user_id = $1
		 ORDER BY w.created_at`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list workspaces: %w", err)
	}
	defer rows.Close()

	var result []*Workspace
	for rows.Next() {
		var ws Workspace
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.CreatedBy, &ws.CreatedAt, &ws.UpdatedAt); err != nil {
			return nil, fmt.Errorf("org: scan workspace: %w", err)
		}
		result = append(result, &ws)
	}
	return result, rows.Err()
}

// ListAllWorkspaces returns every workspace in the system, regardless of membership.
// It is intended for privileged principals (admin/PI) only; callers must enforce that.
func (s *Service) ListAllWorkspaces(ctx context.Context) ([]*Workspace, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, slug, created_by, created_at, updated_at
		 FROM workspaces
		 ORDER BY created_at`,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list all workspaces: %w", err)
	}
	defer rows.Close()

	var result []*Workspace
	for rows.Next() {
		var ws Workspace
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.CreatedBy, &ws.CreatedAt, &ws.UpdatedAt); err != nil {
			return nil, fmt.Errorf("org: scan workspace: %w", err)
		}
		result = append(result, &ws)
	}
	return result, rows.Err()
}
