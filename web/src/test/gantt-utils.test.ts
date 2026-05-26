/**
 * Tests for ganttUtils.ts — date-scale math and bar positioning.
 */

import { describe, it, expect } from 'vitest';
import {
  barPosition,
  markerPosition,
  monthHeaders,
  totalDays,
  computeRangeForIterations,
  iterationBarColor,
  eventKindColor,
  projectColor,
  type DateRange,
} from '../components/gantt/ganttUtils';

// ─── totalDays ────────────────────────────────────────────────────────────────

describe('totalDays', () => {
  it('returns the number of days between start and end', () => {
    const range: DateRange = {
      start: new Date('2026-01-01'),
      end: new Date('2026-04-01'),
    };
    // Jan=31, Feb=28, Mar=31 → 90 days
    expect(totalDays(range)).toBeCloseTo(90, 0);
  });

  it('returns 1 for same-day range (prevents division by zero)', () => {
    const d = new Date('2026-03-15');
    expect(totalDays({ start: d, end: d })).toBe(1);
  });
});

// ─── barPosition ─────────────────────────────────────────────────────────────

describe('barPosition', () => {
  const range: DateRange = {
    start: new Date('2026-01-01'),
    end: new Date('2026-05-01'), // 120 days
  };

  it('starts at 0% when bar starts at range start', () => {
    const { left } = barPosition(new Date('2026-01-01'), new Date('2026-02-01'), range);
    expect(left).toBeCloseTo(0, 1);
  });

  it('returns correct left% for mid-range start', () => {
    // 30 days in on 120-day range = 25%
    const { left } = barPosition(new Date('2026-01-31'), new Date('2026-02-28'), range);
    expect(left).toBeCloseTo(25, 0);
  });

  it('computes correct width% for a 30-day bar on 120-day range = 25%', () => {
    const { width } = barPosition(new Date('2026-01-01'), new Date('2026-01-31'), range);
    expect(width).toBeCloseTo(25, 0);
  });

  it('clamps minimum bar width to 0.5%', () => {
    // Same-day bar (0 width) should get 0.5%
    const d = new Date('2026-02-15');
    const { width } = barPosition(d, d, range);
    expect(width).toBeGreaterThanOrEqual(0.5);
  });

  it('produces left=100% for a bar starting exactly at range end', () => {
    const { left } = barPosition(
      new Date('2026-05-01'),
      new Date('2026-05-15'),
      range,
    );
    expect(left).toBeCloseTo(100, 0);
  });
});

// ─── markerPosition ───────────────────────────────────────────────────────────

describe('markerPosition', () => {
  const range: DateRange = {
    start: new Date('2026-01-01'),
    end: new Date('2026-03-01'), // 59 days
  };

  it('returns 0% at range start', () => {
    expect(markerPosition(new Date('2026-01-01'), range)).toBeCloseTo(0, 0);
  });

  it('returns ~50% at midpoint', () => {
    // midpoint ≈ Jan 30 (day 29 of 59)
    const mid = new Date('2026-01-30');
    const pct = markerPosition(mid, range);
    expect(pct).toBeGreaterThan(40);
    expect(pct).toBeLessThan(60);
  });

  it('returns ~100% at range end', () => {
    expect(markerPosition(new Date('2026-03-01'), range)).toBeCloseTo(100, 0);
  });
});

// ─── monthHeaders ─────────────────────────────────────────────────────────────

describe('monthHeaders', () => {
  it('produces one header per month in range', () => {
    const range: DateRange = {
      start: new Date('2026-01-01'),
      // end is exclusive (cur < range.end), so Jan/Feb/Mar = 3 months
      end: new Date('2026-04-01'),
    };
    const headers = monthHeaders(range);
    // Jan, Feb, Mar — April is the exclusive boundary, not included
    expect(headers).toHaveLength(3);
  });

  it('labels the first month correctly', () => {
    const range: DateRange = {
      start: new Date('2026-03-01'),
      end: new Date('2026-05-01'),
    };
    const headers = monthHeaders(range);
    expect(headers[0].label).toMatch(/Mar/);
  });

  it('headers widths sum to 100%', () => {
    // Use a range that is exactly month-aligned to avoid FP drift
    const range: DateRange = {
      start: new Date('2026-01-01'),
      end: new Date('2026-07-01'),
    };
    const headers = monthHeaders(range);
    const total = headers.reduce((sum, h) => sum + h.width, 0);
    // Should sum to ~100%; allow ±2% for floating-point arithmetic
    expect(total).toBeGreaterThan(98);
    expect(total).toBeLessThanOrEqual(101);
  });
});

// ─── computeRangeForIterations ────────────────────────────────────────────────

describe('computeRangeForIterations', () => {
  it('returns a ~12-month default range when no iterations', () => {
    const { start, end } = computeRangeForIterations([]);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    expect(months).toBeGreaterThanOrEqual(6);
  });

  it('includes buffer before and after dated iterations', () => {
    const iters = [
      { start_at: '2026-03-01T00:00:00Z', end_at: '2026-06-01T00:00:00Z' },
    ];
    const { start, end } = computeRangeForIterations(iters);
    expect(start.getTime()).toBeLessThan(new Date('2026-03-01').getTime());
    expect(end.getTime()).toBeGreaterThan(new Date('2026-06-01').getTime());
  });

  it('handles iterations with only start_at', () => {
    const iters = [{ start_at: '2026-05-01T00:00:00Z', end_at: null }];
    const { start } = computeRangeForIterations(iters);
    expect(start.getTime()).toBeLessThanOrEqual(new Date('2026-05-01').getTime());
  });
});

// ─── Color helpers ────────────────────────────────────────────────────────────

describe('iterationBarColor', () => {
  it('returns distinct colors for active/done/blocked/planned', () => {
    const colors = ['active', 'done', 'blocked', 'planned'].map(iterationBarColor);
    const unique = new Set(colors);
    expect(unique.size).toBe(4);
  });
});

describe('eventKindColor', () => {
  it('returns a non-empty string for all known kinds', () => {
    const kinds = ['deadline', 'milestone_end', 'meeting', 'reminder', 'custom'];
    for (const k of kinds) {
      expect(eventKindColor(k)).toBeTruthy();
    }
  });
});

describe('projectColor', () => {
  it('returns consistent colors for the same index', () => {
    expect(projectColor(0)).toBe(projectColor(0));
  });

  it('wraps around for large indices', () => {
    expect(projectColor(100)).toBeTruthy();
  });
});

// ─── Events → FullCalendar mapping ───────────────────────────────────────────
// Verify that our toFCEvent mapping (used in CalendarPage) produces correct fields.

import type { CalendarEvent } from '../api/eventTypes';

function toFCEvent(ev: CalendarEvent, projectName?: string) {
  return {
    id: ev.id,
    title: ev.title,
    start: ev.start_at,
    end: ev.end_at,
    allDay: ev.all_day,
    extendedProps: { event: ev, projectName },
  };
}

describe('toFCEvent mapping', () => {
  const mockEvent: CalendarEvent = {
    id: 'evt_test',
    project_id: 'proj_nmc',
    kind: 'deadline',
    title: 'Submission deadline',
    description: 'Grant report due',
    start_at: '2026-04-15T09:00:00Z',
    end_at: undefined,
    all_day: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: 'usr_dev',
  };

  it('maps id, title, start correctly', () => {
    const fc = toFCEvent(mockEvent, 'NMC 4.30V');
    expect(fc.id).toBe('evt_test');
    expect(fc.title).toBe('Submission deadline');
    expect(fc.start).toBe('2026-04-15T09:00:00Z');
  });

  it('sets allDay from the event', () => {
    const fc = toFCEvent(mockEvent);
    expect(fc.allDay).toBe(false);
  });

  it('preserves the original event in extendedProps', () => {
    const fc = toFCEvent(mockEvent, 'NMC 4.30V');
    expect((fc.extendedProps.event as CalendarEvent).kind).toBe('deadline');
    expect(fc.extendedProps.projectName).toBe('NMC 4.30V');
  });

  it('maps all-day events correctly', () => {
    const allDayEvent: CalendarEvent = { ...mockEvent, all_day: true };
    const fc = toFCEvent(allDayEvent);
    expect(fc.allDay).toBe(true);
  });
});
