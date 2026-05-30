import { describe, expect, it } from 'vitest';
import { safeAppPath } from '@/lib/safeAppPath';

describe('safeAppPath', () => {
  it('accepts normal app-relative paths', () => {
    expect(safeAppPath('/projects/abc')).toBe('/projects/abc');
    expect(safeAppPath('  /inbox  ')).toBe('/inbox');
  });

  it('rejects absolute and dangerous URLs', () => {
    expect(safeAppPath('https://evil.example/')).toBeNull();
    expect(safeAppPath('//evil.example/path')).toBeNull();
    expect(safeAppPath('javascript:alert(1)')).toBeNull();
    expect(safeAppPath('/ok?next=javascript:alert(1)')).toBe('/ok?next=javascript:alert(1)');
    expect(safeAppPath('data:text/html,<script>')).toBeNull();
    expect(safeAppPath('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects empty and non-path values', () => {
    expect(safeAppPath('')).toBeNull();
    expect(safeAppPath(null)).toBeNull();
    expect(safeAppPath(undefined)).toBeNull();
    expect(safeAppPath('projects/no-slash')).toBeNull();
  });
});
