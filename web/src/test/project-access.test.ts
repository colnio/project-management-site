import { describe, expect, it } from 'vitest';
import {
  canManageProjectCollaborators,
  resolveProjectRole,
} from '@/lib/projectAccess';

describe('resolveProjectRole', () => {
  it('maps workspace owner on workspace-visible project to owner', () => {
    expect(
      resolveProjectRole({
        visibility: 'workspace',
        workspaceMemberRole: 'owner',
      }),
    ).toBe('owner');
  });

  it('ignores workspace membership on private projects unless collaborator', () => {
    expect(
      resolveProjectRole({
        visibility: 'private',
        workspaceMemberRole: 'owner',
      }),
    ).toBe('none');
    expect(
      resolveProjectRole({
        visibility: 'private',
        workspaceMemberRole: 'owner',
        collaboratorRole: 'editor',
      }),
    ).toBe('editor');
  });

  it('takes max of workspace and collaborator roles', () => {
    expect(
      resolveProjectRole({
        visibility: 'workspace',
        workspaceMemberRole: 'member',
        collaboratorRole: 'owner',
      }),
    ).toBe('owner');
  });
});

describe('canManageProjectCollaborators', () => {
  it('is true only for owner', () => {
    expect(canManageProjectCollaborators('owner')).toBe(true);
    expect(canManageProjectCollaborators('editor')).toBe(false);
    expect(canManageProjectCollaborators('viewer')).toBe(false);
    expect(canManageProjectCollaborators('none')).toBe(false);
  });
});
