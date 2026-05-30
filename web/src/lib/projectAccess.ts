/**
 * Client-side mirror of org.ResolveAccess role ranking for a single project.
 * Used to gate UI that the API restricts to project owners (e.g. collaborator add/remove).
 */

export type ProjectRole = 'none' | 'viewer' | 'editor' | 'owner';

const ROLE_RANK: Record<ProjectRole, number> = {
  none: 0,
  viewer: 1,
  editor: 2,
  owner: 3,
};

function maxRole(a: ProjectRole, b: ProjectRole): ProjectRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

function workspaceRoleToProjectRole(wsRole: string): ProjectRole {
  switch (wsRole) {
    case 'owner':
      return 'owner';
    case 'admin':
      return 'editor';
    case 'member':
      return 'viewer';
    default:
      return 'none';
  }
}

function collaboratorRoleToProjectRole(role: string): ProjectRole {
  switch (role) {
    case 'owner':
      return 'owner';
    case 'editor':
      return 'editor';
    case 'viewer':
      return 'viewer';
    default:
      return 'none';
  }
}

/** Effective project role from workspace membership + collaborator row (see internal/org/access.go). */
export function resolveProjectRole(params: {
  visibility: string;
  workspaceMemberRole?: string | null;
  collaboratorRole?: string | null;
}): ProjectRole {
  let effective: ProjectRole = 'none';

  if (params.visibility === 'workspace' && params.workspaceMemberRole) {
    effective = maxRole(effective, workspaceRoleToProjectRole(params.workspaceMemberRole));
  }
  if (params.collaboratorRole) {
    effective = maxRole(effective, collaboratorRoleToProjectRole(params.collaboratorRole));
  }

  return effective;
}

/** True when the user may add/remove project collaborators (API requires owner). */
export function canManageProjectCollaborators(role: ProjectRole): boolean {
  return role === 'owner';
}
