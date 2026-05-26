/**
 * Gantt date-scale utilities.
 *
 * Bar position math:
 *   - Given a [rangeStart, rangeEnd] axis spanning totalDays,
 *   - left%  = (barStart - rangeStart) / totalDays * 100
 *   - width% = (barEnd   - barStart)   / totalDays * 100
 *
 * Minimum bar width is clamped to 0.5% so single-day items are visible.
 */

export interface DateRange {
  start: Date;
  end: Date;
}

export function totalDays(range: DateRange): number {
  return Math.max(
    1,
    (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24),
  );
}

/** Returns left% and width% for a bar positioned within range. */
export function barPosition(
  barStart: Date,
  barEnd: Date,
  range: DateRange,
): { left: number; width: number } {
  const total = totalDays(range);
  const startOffset =
    (barStart.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24);
  const barDays =
    (barEnd.getTime() - barStart.getTime()) / (1000 * 60 * 60 * 24);

  const left = (startOffset / total) * 100;
  const width = Math.max(0.5, (barDays / total) * 100);

  return { left, width };
}

/** Returns left% for a single-point marker within range. */
export function markerPosition(date: Date, range: DateRange): number {
  const total = totalDays(range);
  const offset =
    (date.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24);
  return (offset / total) * 100;
}

/** Returns left% for today's indicator line. */
export function todayPosition(range: DateRange): number {
  return markerPosition(new Date(), range);
}

/** Generate month column headers for the given range. */
export interface MonthHeader {
  label: string;
  left: number;
  width: number;
}

export function monthHeaders(range: DateRange): MonthHeader[] {
  const headers: MonthHeader[] = [];
  const total = totalDays(range);

  const cur = new Date(range.start);
  cur.setDate(1); // snap to month start

  while (cur < range.end) {
    const monthStart = new Date(cur);
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const clampedStart = monthStart < range.start ? range.start : monthStart;
    // Don't extend beyond range.end
    const clampedEnd = monthEnd > range.end ? range.end : monthEnd;

    if (clampedEnd <= clampedStart) {
      cur.setMonth(cur.getMonth() + 1);
      continue;
    }

    const offsetDays =
      (clampedStart.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24);
    const widthDays =
      (clampedEnd.getTime() - clampedStart.getTime()) / (1000 * 60 * 60 * 24);

    headers.push({
      label: clampedStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      left: (offsetDays / total) * 100,
      width: (widthDays / total) * 100,
    });

    cur.setMonth(cur.getMonth() + 1);
  }

  return headers;
}

/**
 * Compute a sensible default range for a set of iterations:
 * earliest start_at - 1 month → latest end_at + 1 month.
 * Falls back to current year if no dated iterations.
 */
export function computeRangeForIterations(
  iterations: Array<{ start_at?: string | null; end_at?: string | null }>,
): DateRange {
  const dates: Date[] = [];
  for (const it of iterations) {
    if (it.start_at) dates.push(new Date(it.start_at));
    if (it.end_at) dates.push(new Date(it.end_at));
  }

  if (dates.length === 0) {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth() + 6, 1),
    };
  }

  const minTime = Math.min(...dates.map(d => d.getTime()));
  const maxTime = Math.max(...dates.map(d => d.getTime()));
  const start = new Date(minTime);
  start.setMonth(start.getMonth() - 1);
  start.setDate(1);
  const end = new Date(maxTime);
  end.setMonth(end.getMonth() + 2);
  end.setDate(1);

  return { start, end };
}

/** Status → color mapping for iteration bars. */
export function iterationBarColor(status: string): string {
  switch (status) {
    case 'active':
      return 'var(--good)';
    case 'done':
      return 'var(--muted-2)';
    case 'blocked':
      return 'var(--bad)';
    case 'planned':
    default:
      return 'var(--info)';
  }
}

/** Event kind → color mapping for markers. */
export function eventKindColor(kind: string): string {
  switch (kind) {
    case 'deadline':
      return 'var(--bad)';
    case 'milestone_end':
      return 'var(--ember)';
    case 'meeting':
      return 'var(--info)';
    case 'reminder':
      return 'var(--warn)';
    default:
      return 'var(--muted)';
  }
}

/** Project index → a stable accent color for unified timeline coloring. */
const PROJECT_COLORS = [
  'var(--ember)',
  '#5a7d9a',
  '#7a5a9a',
  '#5a9a7a',
  '#9a7a5a',
  '#5a6a8a',
  '#8a5a6a',
  '#6a8a5a',
];

export function projectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}
