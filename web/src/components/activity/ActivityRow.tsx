/**
 * ActivityRow — a single timeline event.
 * Clickable link → activityLink(item). Layout mirrors the HomePage ActivityFeed style.
 */
import { Link } from '@tanstack/react-router';
import type { ActivityItem } from '@/hooks/useActivityQueries';
import { activityLink, activityIcon, describeActivity } from './activityHelpers';
import { fmtRelative } from '@/lib/formatDate';

interface ActivityRowProps {
  item: ActivityItem;
  isLast: boolean;
}

export function ActivityRow({ item, isLast }: ActivityRowProps) {
  const { glyph, color } = activityIcon(item.type);
  const link = activityLink(item);
  const description = describeActivity(item);
  const actor = item.actor_name || 'Someone';
  const isComment = item.type === 'task' && item.action === 'task.comment' && !!item.reason;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        paddingBottom: isLast ? 0 : 12,
        marginBottom: isLast ? 0 : 12,
        borderBottom: isLast ? 'none' : '1px solid var(--line)',
      }}
    >
      {/* Icon + timeline stem */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 22 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: `${color}18`,
            border: `1.5px solid ${color}`,
            display: 'grid',
            placeItems: 'center',
            fontSize: 9,
            color,
            flexShrink: 0,
          }}
        >
          {glyph}
        </div>
        {!isLast && (
          <div
            style={{
              width: 1,
              flex: 1,
              background: 'var(--line)',
              marginTop: 4,
              minHeight: 12,
            }}
          />
        )}
      </div>

      {/* Content */}
      <Link
        to={link as '/'}
        style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit', cursor: 'pointer', paddingTop: 1 }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`${actor} ${description}`}
        >
          <strong style={{ fontWeight: 600 }}>{actor}</strong>
          {' '}
          {description}
        </div>

        {/* Optional comment quote */}
        {isComment && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              fontStyle: 'italic',
              marginTop: 3,
              paddingLeft: 8,
              borderLeft: '2px solid var(--line)',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              textOverflow: 'ellipsis',
            }}
          >
            {item.reason}
          </div>
        )}

        {/* Footer: type badge + relative time */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color,
              background: `${color}14`,
              padding: '0 5px',
              borderRadius: 3,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {item.type}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted-2)' }}>
            {fmtRelative(item.created_at)}
          </span>
        </div>
      </Link>
    </div>
  );
}
