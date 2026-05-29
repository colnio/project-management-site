import { useMemo } from 'react';
import { useWorkspaceMembers } from '@/hooks/useQueries';
import { buildUserDirectory, type UserDirectory } from '@/lib/userDisplay';

export function useUserDirectory(workspaceId: string | undefined): {
  directory: UserDirectory;
  isLoading: boolean;
} {
  const { data: members = [], isLoading } = useWorkspaceMembers(workspaceId);
  const directory = useMemo(() => buildUserDirectory(members), [members]);
  return { directory, isLoading };
}
