const fmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export function fmtDate(iso: string | Date): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(d.getTime())) return '';
    return fmt.format(d);
  } catch {
    return '';
  }
}

/** ISO timestamp → value for an <input type="datetime-local"> (local time, no tz). */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value → ISO string (or undefined when empty). */
export function datetimeLocalToIso(val: string): string | undefined {
  if (!val) return undefined;
  const d = new Date(val);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** Compact "start – end" range for display; falls back gracefully. */
export function fmtRange(start?: string | null, end?: string | null): string {
  const s = start ? fmtDate(start) : '';
  const e = end ? fmtDate(end) : '';
  if (s && e) return s === e ? s : `${s} – ${e}`;
  return s || e || '';
}

export function fmtRelative(iso: string | Date): string {
  const str = typeof iso === 'string' ? iso : iso.toISOString();
  const diff = Date.now() - new Date(str).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(str);
}
