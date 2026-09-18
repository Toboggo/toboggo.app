/**
 * Pushes rows already shown elsewhere (the contextual carousel) after the
 * rest, stably, without dropping them — "all the parks around you" still
 * means all of them, they just don't repeat in the very first rows.
 */
export function pushShownToEnd<T extends { id: string }>(rows: T[], shownIds: string[]): T[] {
  if (shownIds.length === 0) return rows;
  const shown = new Set(shownIds);
  return [...rows.filter((r) => !shown.has(r.id)), ...rows.filter((r) => shown.has(r.id))];
}
