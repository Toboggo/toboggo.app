// Libellés lisibles pour les codes ISO les plus probables du catalogue —
// purement cosmétique : un pays absent de ce dictionnaire s'affiche quand
// même, avec son code brut comme libellé (jamais masqué, jamais bloquant —
// voir "prévoir l'architecture pour que de futurs pays apparaissent
// automatiquement", Admin-UI-7D-C §4). Source unique partagée par Dashboard
// (carte de couverture géographique) et Parks (colonne + filtre Pays,
// Admin-UI-8D) — ne pas dupliquer cette table ailleurs.
export const COUNTRY_LABEL: Record<string, string> = {
  FR: "France",
  ES: "Espagne",
  BE: "Belgique",
  CH: "Suisse",
  DE: "Allemagne",
  IT: "Italie",
  PT: "Portugal",
  LU: "Luxembourg",
};

/** `COUNTRY_LABEL[code]`, avec repli sur le code brut (`ES`, …) pour un pays
 * pas encore répertorié. */
export function countryLabel(code: string): string {
  return COUNTRY_LABEL[code] ?? code;
}
