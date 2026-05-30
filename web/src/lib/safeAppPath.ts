/**
 * Returns a safe in-app navigation path, or null if the value must not be used as href/to.
 * Only relative paths starting with "/" are allowed (rejects absolute URLs and script schemes).
 */
export function safeAppPath(link: string | null | undefined): string | null {
  if (link == null) return null;

  const trimmed = link.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;

  const lower = trimmed.toLowerCase();
  if (lower.includes('://')) return null;
  if (lower.startsWith('javascript:')) return null;
  if (lower.startsWith('data:')) return null;
  if (lower.startsWith('vbscript:')) return null;

  return trimmed;
}
