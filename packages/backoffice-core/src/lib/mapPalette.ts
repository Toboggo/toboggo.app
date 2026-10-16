/**
 * Couleurs des repères de carte (MapLibre colore ses marqueurs en JS : les
 * variables CSS n'y sont pas lisibles). Valeurs = palette officielle Brand
 * Book v2, identiques aux tokens de `bo-theme.css` :
 *   --bo-green #2FA37C · --bo-orange #FFB020 · --bo-error #B91C1C · --bo-ink #24303A
 */
export const PIN_COLORS = {
  ok: "#2fa37c",
  pending: "#ffb020",
  report: "#b91c1c",
  blocked: "#24303a",
} as const;

export function parkPinColor(park: { status: string; has_open_report?: boolean | null }): string {
  if (park.status === "blocked") return PIN_COLORS.blocked;
  if (park.has_open_report) return PIN_COLORS.report;
  if (park.status === "draft" || park.status === "pending") return PIN_COLORS.pending;
  return PIN_COLORS.ok;
}
