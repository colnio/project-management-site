import { useAuth } from '@/hooks/useAuth';
import {
  useProject,
  useProjectCollaborators,
  useWorkspaceMembers,
} from '@/hooks/useQueries';
import {
  canManageProjectCollaborators,
  resolveProjectRole,
  type ProjectRole,
} from '@/lib/projectAccess';

/** Resolved effective project role for the signed-in user (matches server org.ResolveAccess). */
export function useResolvedProjectRole(projectId: string | undefined): {
  role: ProjectRole;
  canManageCollaborators: boolean;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: members = [], isLoading: membersLoading } = useWorkspaceMembers(
    project?.workspace_id,
  );
  const { data: collaborators = [], isLoading: collabsLoading } =
    useProjectCollaborators(projectId);

  if (!project || !user) {
    return {
      role: 'none',
      canManageCollaborators: false,
      isLoading: !!projectId && (projectLoading || membersLoading || collabsLoading),
    };
  }

  const workspaceMemberRole = members.find(m => m.user_id === user.id)?.role;
  const collaboratorRole = collaborators.find(c => c.user_id === user.id)?.role;
  const role = resolveProjectRole({
    visibility: project.visibility,
    workspaceMemberRole,
    collaboratorRole,
  });

  return {
    role,
    canManageCollaborators: canManageProjectCollaborators(role),
    isLoading: projectLoading || membersLoading || collabsLoading,
  };
}
