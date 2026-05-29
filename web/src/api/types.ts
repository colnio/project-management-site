/**
 * Convenience re-exports from the generated schema, aliased to clean names.
 */
import type { components } from './schema.d.ts';

export type User = components['schemas']['UserJSON'];
export type Workspace = components['schemas']['Workspace'];
export type Project = components['schemas']['Project'];
export type Sample = components['schemas']['Sample'];
export type Experiment = components['schemas']['Experiment'] & {
  /** Project-defined labels; primary display tag is also in `method`. */
  tags?: string[];
};

/** Tags to show in the UI (falls back to legacy single `method`). */
export function experimentDisplayTags(e: Pick<Experiment, 'method' | 'tags'>): string[] {
  if (e.tags && e.tags.length > 0) return e.tags;
  if (e.method && e.method !== 'custom') return [e.method];
  return [];
}
export type Iteration = components['schemas']['Iteration'];
export type Artifact = components['schemas']['Artifact'];
export type LoginOutput = components['schemas']['LoginOutputBody_3ca2d2c'];
export type RefreshOutput = components['schemas']['RefreshOutputBody_2dfb9844'];

/**
 * Returns true for admin or pi — users allowed to manage workspaces, users,
 * toggle PI review on risks, etc.
 */
export function isPrivileged(user: User | null | undefined): boolean {
  return user?.global_role === 'admin' || user?.global_role === 'pi';
}

/** Shape returned by POST /v1/auth/register */
export interface RegisterOutput {
  status: 'pending';
  message: string;
}

/** Shape returned by GET /v1/admin/users */
export interface AdminUserView {
  id: string;
  email: string;
  display_name: string;
  global_role: 'admin' | 'pi' | 'member';
  status: 'pending' | 'approved' | 'suspended';
  profile_completed: boolean;
  first_name?: string;
  last_name?: string;
  title?: string;
  created_at: string;
}
