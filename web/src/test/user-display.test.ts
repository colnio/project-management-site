import { describe, it, expect } from 'vitest';
import {
  formatUserLabel,
  memberLabel,
  buildUserDirectory,
  resolveUserLabel,
} from '@/lib/userDisplay';
import type { MemberView } from '@/hooks/useWorkspaceQueries';

const baseMember: MemberView = {
  id: 'mem-1',
  workspace_id: 'ws-1',
  user_id: '179a6ee0-1234-5678-9abc-def012345678',
  role: 'owner',
  email: 'lead@example.com',
  display_name: 'Alex Lead',
  user_created_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-02T00:00:00Z',
};

describe('formatUserLabel', () => {
  it('prefers display_name over email and user_id', () => {
    expect(
      formatUserLabel({
        display_name: 'Alex Lead',
        email: 'lead@example.com',
        user_id: baseMember.user_id,
      }),
    ).toBe('Alex Lead');
  });

  it('falls back to email when display_name is empty', () => {
    expect(
      formatUserLabel({
        display_name: '',
        email: 'lead@example.com',
        user_id: baseMember.user_id,
      }),
    ).toBe('lead@example.com');
  });

  it('falls back to truncated user_id when profile fields are empty', () => {
    expect(
      formatUserLabel({
        display_name: '',
        email: '',
        user_id: baseMember.user_id,
      }),
    ).toBe('179a6ee0…');
  });
});

describe('memberLabel', () => {
  it('uses member profile fields', () => {
    expect(memberLabel(baseMember)).toBe('Alex Lead');
  });
});

describe('resolveUserLabel', () => {
  it('resolves from directory when user_id is known', () => {
    const dir = buildUserDirectory([baseMember]);
    expect(resolveUserLabel(dir, baseMember.user_id)).toBe('Alex Lead');
  });

  it('falls back when user_id is not in directory', () => {
    const dir = buildUserDirectory([]);
    expect(resolveUserLabel(dir, 'deadbeef-0000-0000-0000-000000000001')).toBe('deadbeef…');
  });
});
