package org

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// ─── Membership management ────────────────────────────────────────────────────

// WorkspaceRole returns the user's role in the workspace, or ("", false, nil) if not a member.
func (s *Service) WorkspaceRole(ctx context.Context, workspaceID, userID uuid.UUID) (string, bool, error) {
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, userID,
	).Scan(&role)
	if err == pgx.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("org: workspace role: %w", err)
	}
	return role, true, nil
}

// AddMember upserts a workspace membership. The caller must have already verified authorization.
func (s *Service) AddMember(ctx context.Context, workspaceID, userID uuid.UUID, role string, actorID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		workspaceID, userID, role,
	)
	if err != nil {
		return fmt.Errorf("org: add member: %w", err)
	}
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "workspace.member_add",
		ResourceType: "workspace_membership",
		ResourceID:   workspaceID.String(),
	})
	return nil
}

// RemoveMember removes a workspace membership. Returns an error if removing would leave no owners.
func (s *Service) RemoveMember(ctx context.Context, workspaceID, targetUserID uuid.UUID, actorID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("org: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var targetRole string
	err = tx.QueryRow(ctx,
		`SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, targetUserID,
	).Scan(&targetRole)
	if err == pgx.ErrNoRows {
		return platform.NotFound("membership.not_found", "membership not found")
	}
	if err != nil {
		return fmt.Errorf("org: check target role: %w", err)
	}

	if targetRole == "owner" {
		var ownerCount int
		err = tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM workspace_memberships WHERE workspace_id=$1 AND role='owner'`,
			workspaceID,
		).Scan(&ownerCount)
		if err != nil {
			return fmt.Errorf("org: count owners: %w", err)
		}
		if ownerCount <= 1 {
			return platform.BadRequest("membership.last_owner", "cannot remove the last workspace owner")
		}
	}

	tag, err := tx.Exec(ctx,
		`DELETE FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, targetUserID,
	)
	if err != nil {
		return fmt.Errorf("org: remove member: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("membership.not_found", "membership not found")
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("org: commit remove member: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        actorID,
		Action:       "workspace.member_remove",
		ResourceType: "workspace_membership",
		ResourceID:   workspaceID.String(),
	})
	return nil
}

// ListMembers returns all memberships for a workspace.
func (s *Service) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]Membership, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, user_id, role, created_at
		 FROM workspace_memberships WHERE workspace_id=$1 ORDER BY created_at`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list members: %w", err)
	}
	defer rows.Close()

	var result []Membership
	for rows.Next() {
		var m Membership
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("org: scan membership: %w", err)
		}
		result = append(result, m)
	}
	return result, rows.Err()
}

// ListMembersEnriched returns workspace memberships enriched with user profile
// fields via the auth module (no cross-module SQL on users).
func (s *Service) ListMembersEnriched(ctx context.Context, workspaceID uuid.UUID) ([]MemberView, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT m.id, m.workspace_id, m.user_id, m.role, m.created_at
		 FROM workspace_memberships m
		 WHERE m.workspace_id = $1
		 ORDER BY m.created_at`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list members enriched: %w", err)
	}
	defer rows.Close()

	var base []MemberView
	var userIDs []uuid.UUID
	for rows.Next() {
		var mv MemberView
		if err := rows.Scan(
			&mv.ID, &mv.WorkspaceID, &mv.UserID, &mv.Role, &mv.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("org: scan member view: %w", err)
		}
		base = append(base, mv)
		userIDs = append(userIDs, mv.UserID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("org: list members enriched rows: %w", err)
	}

	usersByID, err := s.users.GetUsersByIDs(ctx, userIDs)
	if err != nil {
		return nil, fmt.Errorf("org: list members enriched users: %w", err)
	}

	result := make([]MemberView, 0, len(base))
	for _, mv := range base {
		if u, ok := usersByID[mv.UserID]; ok {
			mv.Email = u.Email
			mv.DisplayName = u.DisplayName
			mv.UserCreatedAt = u.CreatedAt
		}
		result = append(result, mv)
	}
	return result, nil
}

// ─── Project collaborator Go API ─────────────────────────────────────────────

// AddCollaborator upserts a project collaborator entry.
func (s *Service) AddCollaborator(ctx context.Context, projectID, userID uuid.UUID, role Role) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO project_collaborations (project_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		projectID, userID, string(role),
	)
	if err != nil {
		return fmt.Errorf("org: add collaborator: %w", err)
	}
	return nil
}

// RemoveCollaborator deletes a project collaborator entry.
func (s *Service) RemoveCollaborator(ctx context.Context, projectID, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM project_collaborations WHERE project_id=$1 AND user_id=$2`,
		projectID, userID,
	)
	if err != nil {
		return fmt.Errorf("org: remove collaborator: %w", err)
	}
	return nil
}

// ListCollaborators returns all collaborators for a project.
func (s *Service) ListCollaborators(ctx context.Context, projectID uuid.UUID) ([]Collaborator, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, user_id, role, created_at
		 FROM project_collaborations WHERE project_id=$1 ORDER BY created_at`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list collaborators: %w", err)
	}
	defer rows.Close()

	var result []Collaborator
	for rows.Next() {
		var c Collaborator
		var roleStr string
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.UserID, &roleStr, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("org: scan collaborator: %w", err)
		}
		c.Role = Role(roleStr)
		result = append(result, c)
	}
	return result, rows.Err()
}

// ListCollaboratorsEnriched returns project collaborators enriched with user
// profile fields via the auth module (no cross-module SQL on users).
func (s *Service) ListCollaboratorsEnriched(ctx context.Context, projectID uuid.UUID) ([]CollaboratorView, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT c.id, c.project_id, c.user_id, c.role, c.created_at
		 FROM project_collaborations c
		 WHERE c.project_id = $1
		 ORDER BY c.created_at`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("org: list collaborators enriched: %w", err)
	}
	defer rows.Close()

	var base []CollaboratorView
	var userIDs []uuid.UUID
	for rows.Next() {
		var cv CollaboratorView
		if err := rows.Scan(
			&cv.ID, &cv.ProjectID, &cv.UserID, &cv.Role, &cv.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("org: scan collaborator view: %w", err)
		}
		base = append(base, cv)
		userIDs = append(userIDs, cv.UserID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("org: list collaborators enriched rows: %w", err)
	}

	usersByID, err := s.users.GetUsersByIDs(ctx, userIDs)
	if err != nil {
		return nil, fmt.Errorf("org: list collaborators enriched users: %w", err)
	}

	result := make([]CollaboratorView, 0, len(base))
	for _, cv := range base {
		if u, ok := usersByID[cv.UserID]; ok {
			cv.Email = u.Email
			cv.DisplayName = u.DisplayName
		}
		result = append(result, cv)
	}
	return result, nil
}

// CollaboratorRole returns the role and a found boolean for a specific collaborator.
func (s *Service) CollaboratorRole(ctx context.Context, projectID, userID uuid.UUID) (Role, bool, error) {
	var roleStr string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM project_collaborations WHERE project_id=$1 AND user_id=$2`,
		projectID, userID,
	).Scan(&roleStr)
	if err == pgx.ErrNoRows {
		return RoleNone, false, nil
	}
	if err != nil {
		return RoleNone, false, fmt.Errorf("org: collaborator role: %w", err)
	}
	return Role(roleStr), true, nil
}
