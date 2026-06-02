export const TOKEN_SCOPES = [
  'read:projects',
  'write:projects',
  'read:samples',
  'write:samples',
  'read:experiments',
  'write:experiments',
  'read:iterations',
  'write:iterations',
  'read:risks',
  'write:risks',
  'read:artifacts',
  'write:artifacts',
  'read:pages',
  'write:pages',
  'read:meetings',
  'write:meetings',
  'read:calendar',
  'write:calendar',
  'read:ai',
  'write:ai',
  'read:inbox',
  'read:notify',
  'write:notify',
  'read:audit',
  'read:approvals',
  'write:approvals',
  'admin:org',
  'read:admin',
  'write:admin',
  'manage:tokens',
  'write:profile',
] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];

export function hasSelectedTokenScopes(scopes: Pick<Set<string>, 'size'>): boolean {
  return scopes.size > 0;
}
