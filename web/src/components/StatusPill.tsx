interface StatusPillProps {
  status: string;
}

export function StatusPill({ status }: StatusPillProps) {
  const cls = status.toLowerCase().replace(/[\s_]+/g, '-');
  return (
    <span className={`pill s-${cls}`}>
      <span className={`dot-s ${cls}`} />
      {status}
    </span>
  );
}

