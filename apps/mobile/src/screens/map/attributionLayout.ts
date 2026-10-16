/**
 * Position verticale du contrôle d'attribution de la carte sur Explorer.
 *
 * L'écran empile (du bas) : la barre de navigation flottante (`navH`, safe area
 * iOS comprise), puis la feuille (`sheetHeight`, peinte derrière la barre). Le
 * contrôle d'attribution MapLibre, collé au bas de la carte, était donc
 * recouvert. On le remonte au-dessus de la feuille ; la marge de 10 px entre le
 * contrôle et la feuille vient du style compact de MapLibre (`margin: 10px`).
 *
 * Quand la feuille monte au point où le contrôle ne tient plus entre l'en-tête
 * flottant et la feuille (dernier cran : la carte est entièrement couverte), il
 * est masqué (`hidden`) au lieu d'être écrasé sous l'en-tête ou la feuille ; il
 * redevient visible dès que la carte réapparaît. L'écran « Sources des données »
 * (À propos) reste l'accès permanent aux deux mentions.
 */
/** Hauteur maximale du contrôle (déplié sur 2 lignes : 8 + 2×~16 + 8 px) + marge haute. */
export const ATTRIBUTION_CONTROL_H = 56;

export function attributionLayout({
  navH,
  sheetHeight,
  viewportH,
  headerBottom,
}: {
  navH: number;
  sheetHeight: number;
  viewportH: number;
  headerBottom: number;
}): { bottom: number; hidden: boolean } {
  const bottom = Math.max(0, Math.round(navH + sheetHeight));
  // Viewport pas encore mesuré : on ne masque pas.
  const hidden = viewportH > 0 && viewportH - bottom - ATTRIBUTION_CONTROL_H < headerBottom;
  return { bottom, hidden };
}
