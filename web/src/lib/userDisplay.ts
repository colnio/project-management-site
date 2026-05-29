import type { MemberView } from '@/hooks/useWorkspaceQueries';

export interface UserProfileFields {
  display_name?: string;
  email?: string;
  user_id: string;
}

export type UserDirectory = Map<string, { display_name: string; email: string }>;

function truncateUserId(userId: string): string {
  return userId.length > 8 ? `${userId.slice(0, 8)}…` : userId;
}

/** Prefer display_name, then email, then truncated user_id (ShareDialog convention). */
export function formatUserLabel(fields: UserProfileFields): string {
  const name = fields.display_name?.trim();
  if (name) return name;
  const email = fields.email?.trim();
  if (email) return email;
  return truncateUserId(fields.user_id);
}

export function memberLabel(m: MemberView): string {
  return formatUserLabel(m);
}

export function buildUserDirectory(members: MemberView[]): UserDirectory {
  const dir: UserDirectory = new Map();
  for (const m of members) {
    dir.set(m.user_id, { display_name: m.display_name, email: m.email });
  }
  return dir;
}

export function resolveUserLabel(directory: UserDirectory, userId: string): string {
  const entry = directory.get(userId);
  if (entry) {
    return formatUserLabel({ ...entry, user_id: userId });
  }
  return truncateUserId(userId);
}
