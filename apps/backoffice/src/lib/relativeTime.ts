/** "il y a 3 h" style, with the exact timestamp always available via `title`
 * (hover / screen reader) — never lose the precise date, just lead with the
 * human-readable one. Shared by the Dashboard panels (COLL-02C) and the
 * collectivité parks screens (COLL-03). */
export function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `il y a ${diffD} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}
