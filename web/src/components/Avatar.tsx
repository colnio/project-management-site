interface AvatarProps {
  name: string;
  size?: number;
  ring?: boolean;
}

const COLORS = [
  '#d97757', '#2c5b6a', '#5a7d3a', '#7a5aa0', '#c4882a',
  '#4a6a8c', '#8c4a6a', '#4a8c6a',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(name: string): string {
  return name
    .split(' ')
    .map(s => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({ name, size = 24, ring = false }: AvatarProps) {
  const bg = colorForName(name);
  const init = initials(name || '?');
  const fontSize = Math.max(9, size * 0.42);

  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.02em',
        flexShrink: 0,
        boxShadow: ring ? '0 0 0 2px var(--paper)' : 'none',
      }}
    >
      {init}
    </div>
  );
}
