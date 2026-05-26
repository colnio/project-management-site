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

export function KindPill({ kind }: { kind: string }) {
  return <span className={`pill k-${kind}`}>{kind}</span>;
}
