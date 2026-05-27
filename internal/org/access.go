package org

import (
	"context"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
)

// Role represents the effective access level a user has on a project.
type Role string

const (
	RoleNone   Role = "none"
	RoleViewer Role = "viewer"
	RoleEditor Role = "editor"
	RoleOwner  Role = "owner"
)

func (r Role) rank() int {
	switch r {
	case RoleViewer:
		return 1
	case RoleEditor:
		return 2
	case RoleOwner:
		return 3
	default:
		return 0
	}
}

// CanRead reports whether the role permits reading (viewer+).
func (r Role) CanRead() bool { return r.rank() >= RoleViewer.rank() }

// CanWrite reports whether the role permits writing (editor+).
func (r Role) CanWrite() bool { return r.rank() >= RoleEditor.rank() }

// CanManage reports whether the role permits management (owner only).
func (r Role) CanManage() bool { return r == RoleOwner }

func maxRole(a, b Role) Role {
	if a.rank() >= b.rank() {
		return a
	}
	return b
}

// ResolveAccess returns the effective (max) role for a user on a project, given
// the project's visibility ("workspace"|"private") and workspace. projectID may
// be nil for a workspace-level question (returns max of override/ws role).
// Effective = max(adminOverride→viewer, workspaceRoleIfWorkspaceVisible, collaboratorRole).
func (s *Service) ResolveAccess(ctx context.Context, userID, workspaceID uuid.UUID, projectVisibility string, projectID *uuid.UUID) (Role, error) {
	effective := RoleNone

	// Check admin override — grants at least viewer.
	var overrideExists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM admin_overrides WHERE workspace_id=$1 AND user_id=$2)`,
		workspaceID, userID,
	).Scan(&overrideExists)
	if err != nil {
		return RoleNone, err
	}
	if overrideExists {
		effective = maxRole(effective, RoleViewer)
	}

	// Check workspace membership and map to project role for workspace-visible projects.
	var wsRole string
	wsRoleErr := s.pool.QueryRow(ctx,
		`SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, userID,
	).Scan(&wsRole)
	if wsRoleErr == nil {
		// Map workspace role to project role for workspace-visible projects.
		if projectVisibility == "workspace" {
			switch wsRole {
			case "owner":
				effective = maxRole(effective, RoleOwner)
			case "admin":
				effective = maxRole(effective, RoleEditor)
			case "member":
				effective = maxRole(effective, RoleEditor)
			}
		}
		// For workspace-level questions (no projectID), also contribute workspace role.
		if projectID == nil {
			switch wsRole {
			case "owner":
				effective = maxRole(effective, RoleOwner)
			case "admin":
				effective = maxRole(effective, RoleEditor)
			case "member":
				effective = maxRole(effective, RoleViewer)
			}
		}
	}

	// Check project-specific collaborator role.
	if projectID != nil {
		var collabRole string
		collabErr := s.pool.QueryRow(ctx,
			`SELECT role FROM project_collaborations WHERE project_id=$1 AND user_id=$2`,
			*projectID, userID,
		).Scan(&collabRole)
		if collabErr == nil {
			switch collabRole {
			case "owner":
				effective = maxRole(effective, RoleOwner)
			case "editor":
				effective = maxRole(effective, RoleEditor)
			case "viewer":
				effective = maxRole(effective, RoleViewer)
			}
		}
	}

	return effective, nil
}

// ResolveAccessForPrincipal is a convenience wrapper that also handles
// privileged users (admin or PI): if p.IsPrivileged() is true and the
// resolved role is none/viewer, it bumps the effective role to at least viewer
// (and records an audit entry when that bump is what grants access).
func (s *Service) ResolveAccessForPrincipal(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID, projectVisibility string, projectID *uuid.UUID) (Role, error) {
	role, err := s.ResolveAccess(ctx, p.UserID, workspaceID, projectVisibility, projectID)
	if err != nil {
		return RoleNone, err
	}

	if p.IsPrivileged() && !role.CanRead() {
		// Privileged-user override bump — audit this.
		_ = s.rec.Record(ctx, audit.Entry{
			Actor:        p.UserID,
			ViaTokenID:   p.ViaTokenID,
			Action:       "admin.override_access",
			ResourceType: "workspace",
			ResourceID:   workspaceID.String(),
		})
		return RoleViewer, nil
	}
	return role, nil
}
