/**
 * Pure helpers for the Activity dashboard: links, descriptions, icons.
 * No React imports — safe to use in both components and tests.
 */
import type { ActivityItem } from '@/hooks/useActivityQueries';

// ─── Link ─────────────────────────────────────────────────────────────────────

export function activityLink(item: ActivityItem): string {
  switch (item.type) {
    case 'project':
      return `/projects/${item.entity_id}`;
    case 'iteration':
      return `/iterations/${item.entity_id}`;
    case 'sample':
      return `/samples/${item.entity_id}`;
    case 'experiment':
      return `/experiments/${item.entity_id}`;
    case 'page':
      return `/pages/${item.entity_id}`;
    case 'artifact':
      return `/artifacts/${item.entity_id}`;
    case 'risk':
      return `/projects/${item.project_id}`;
    case 'task':
      return `/projects/${item.project_id}?tab=tasks&task=${item.entity_id}`;
    default:
      return `/projects/${item.project_id}`;
  }
}

// ─── Description ─────────────────────────────────────────────────────────────

export function describeActivity(item: ActivityItem): string {
  const { action, type, title, from_status, to_status } = item;

  switch (action) {
    case 'task.status_change':
      return `moved "${title}" ${from_status ?? '?'} → ${to_status ?? '?'}`;
    case 'task.comment':
      return `commented on "${title}"`;
    case 'task.reassign':
      return `reassigned "${title}"`;
    case 'task.reopen':
      return `reopened "${title}"`;
    case 'task.delay':
      return `pushed the estimate on "${title}"`;
    case 'task.created':
    case 'task.create':
      return `added task "${title}"`;
    case 'task.reference_added':
      return `added a reference on "${title}"`;
    case 'task.reference_removed':
      return `removed a reference on "${title}"`;
    default: {
      // Generic by suffix
      if (action.endsWith('.create')) return `added ${type} "${title}"`;
      if (action.endsWith('.update')) return `updated ${type} "${title}"`;
      return `${action} "${title}"`;
    }
  }
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

export interface ActivityIconDef {
  glyph: string;
  color: string;
}

const ACTIVITY_ICON: Record<ActivityItem['type'], ActivityIconDef> = {
  project:    { glyph: '◆', color: 'var(--info)' },
  iteration:  { glyph: '▦', color: 'var(--ink-2)' },
  sample:     { glyph: '◈', color: 'var(--good)' },
  experiment: { glyph: '⚗', color: 'var(--muted-2)' },
  page:       { glyph: '✎', color: 'var(--ember)' },
  artifact:   { glyph: '⎙', color: 'var(--ink-2)' },
  risk:       { glyph: '⚑', color: 'var(--bad)' },
  task:       { glyph: '◷', color: 'var(--info)' },
};

export function activityIcon(type: ActivityItem['type']): ActivityIconDef {
  return ACTIVITY_ICON[type] ?? { glyph: '·', color: 'var(--muted-2)' };
}
