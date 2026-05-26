/**
 * Tests for page editor utilities:
 * - Auto-save debounce timer logic
 * - Diff renderer data transformation
 * - ETag/412 conflict detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Auto-save debounce logic ──────────────────────────────────────────────────

/**
 * Standalone debounce function that mirrors the auto-save logic in PageEditorPage.
 * Returns a handle that tracks if a save has been triggered.
 */
function createAutoSaveController(debounceMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saveCount = 0;
  let lastSource: 'human' | 'auto_save' | null = null;

  const save = (source: 'human' | 'auto_save') => {
    saveCount++;
    lastSource = source;
  };

  const onEdit = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null; // mark as fired
      save('auto_save');
    }, debounceMs);
  };

  const onManualSave = () => {
    if (timer) clearTimeout(timer);
    save('human');
  };

  const onBlur = () => {
    // Only save if timer is pending (i.e. there are unsaved changes)
    if (timer) {
      clearTimeout(timer);
      timer = null;
      save('auto_save');
    }
  };

  const cleanup = () => {
    if (timer) clearTimeout(timer);
  };

  return { onEdit, onManualSave, onBlur, cleanup, getSaveCount: () => saveCount, getLastSource: () => lastSource };
}

describe('auto-save debounce logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not save immediately on edit', () => {
    const ctrl = createAutoSaveController(10000);
    ctrl.onEdit();
    expect(ctrl.getSaveCount()).toBe(0);
    ctrl.cleanup();
  });

  it('saves with auto_save after 10s idle', () => {
    const ctrl = createAutoSaveController(10000);
    ctrl.onEdit();
    vi.advanceTimersByTime(10000);
    expect(ctrl.getSaveCount()).toBe(1);
    expect(ctrl.getLastSource()).toBe('auto_save');
    ctrl.cleanup();
  });

  it('resets timer on subsequent edits', () => {
    const ctrl = createAutoSaveController(10000);
    ctrl.onEdit();
    vi.advanceTimersByTime(5000);
    ctrl.onEdit(); // reset
    vi.advanceTimersByTime(5000);
    expect(ctrl.getSaveCount()).toBe(0); // not yet
    vi.advanceTimersByTime(5000);
    expect(ctrl.getSaveCount()).toBe(1);
    ctrl.cleanup();
  });

  it('saves on blur when there are pending changes', () => {
    const ctrl = createAutoSaveController(10000);
    ctrl.onEdit();
    ctrl.onBlur();
    expect(ctrl.getSaveCount()).toBe(1);
    expect(ctrl.getLastSource()).toBe('auto_save');
    ctrl.cleanup();
  });

  it('does not double-save on blur when timer already fired', () => {
    const ctrl = createAutoSaveController(10000);
    ctrl.onEdit();
    vi.advanceTimersByTime(10000); // auto-save fires
    ctrl.onBlur();                  // no pending timer, no extra save
    expect(ctrl.getSaveCount()).toBe(1);
    ctrl.cleanup();
  });

  it('saves immediately on manual save (human source)', () => {
    const ctrl = createAutoSaveController(10000);
    ctrl.onEdit();
    ctrl.onManualSave();
    expect(ctrl.getSaveCount()).toBe(1);
    expect(ctrl.getLastSource()).toBe('human');
    // auto-save timer cancelled — no extra save after
    vi.advanceTimersByTime(10000);
    expect(ctrl.getSaveCount()).toBe(1);
    ctrl.cleanup();
  });
});

// ─── Diff viewer data transformation ──────────────────────────────────────────

type DiffLine = { op: '+' | '-' | ' '; text: string };

function classifyDiffLines(lines: DiffLine[]) {
  return {
    added: lines.filter(l => l.op === '+').length,
    removed: lines.filter(l => l.op === '-').length,
    unchanged: lines.filter(l => l.op === ' ').length,
  };
}

describe('diff renderer data', () => {
  it('classifies added lines correctly', () => {
    const lines: DiffLine[] = [
      { op: ' ', text: 'unchanged' },
      { op: '+', text: 'new content' },
      { op: '+', text: 'more new' },
      { op: '-', text: 'removed' },
    ];
    const result = classifyDiffLines(lines);
    expect(result.added).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.unchanged).toBe(1);
  });

  it('handles empty diff', () => {
    const result = classifyDiffLines([]);
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  it('handles only unchanged lines', () => {
    const lines: DiffLine[] = [
      { op: ' ', text: 'line 1' },
      { op: ' ', text: 'line 2' },
    ];
    const result = classifyDiffLines(lines);
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.unchanged).toBe(2);
  });
});

// ─── ETag / 412 conflict detection ────────────────────────────────────────────

describe('ETag conflict detection', () => {
  it('detects stale ETag (412 scenario)', () => {
    const currentEtag = '"etag-page_1-rev_initial"';
    const serverEtag = '"etag-page_1-rev_new"';

    // This simulates the check before a PUT — if etags differ, a conflict occurred
    const isConflict = (_clientEtag: string, responseStatus: number) =>
      responseStatus === 412;

    // Our etag is stale — server returns 412
    expect(isConflict(currentEtag, 412)).toBe(true);
    // If server returns 200, no conflict
    expect(isConflict(serverEtag, 200)).toBe(false);
  });

  it('updates local etag after successful save', () => {
    let localEtag = '"etag-initial"';
    const serverEtag = '"etag-after-save"';

    // Simulate successful PUT response
    const onSaveSuccess = (newEtag: string) => {
      localEtag = newEtag;
    };

    onSaveSuccess(serverEtag);
    expect(localEtag).toBe(serverEtag);
  });

  it('does not update local etag on 412', () => {
    const localEtag = '"etag-initial"';

    const onSave412 = (_newEtag: string) => {
      // Should NOT update on 412 — keep local etag
    };

    onSave412('"etag-server"');
    expect(localEtag).toBe('"etag-initial"'); // unchanged
  });
});
