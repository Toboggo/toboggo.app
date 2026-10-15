/**
 * Attribution des données OpenStreetMap — constantes partagées.
 *
 * Les textes affichés (`© OpenStreetMap contributors`, `ODbL`) sont des noms
 * propres/une mention imposée : ils ne sont volontairement pas traduits. Seuls
 * les libellés d'interface alentour passent par i18n (`profile:dataSources.*`).
 *
 * Le fond de carte a sa propre mention (`MAP_CREDIT`), lue côté carte depuis le
 * style par le contrôle d'attribution MapLibre (voir `packages/shared/src/map.ts`).
 * Sur l'écran Explorer ce contrôle est recouvert par la barre de navigation :
 * l'écran « Sources des données » reprend donc les deux mentions.
 *
 * Cette mention est une attribution, pas une analyse de conformité à l'ODbL
 * (partage à l'identique, accès à la base dérivée : questions juridiques à
 * traiter séparément).
 */
export const OSM_CREDIT = "© OpenStreetMap contributors";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
export const ODBL_LABEL = "ODbL";
export const ODBL_URL = "https://opendatacommons.org/licenses/odbl/1-0/";

/** Mention de crédit du fond de carte (texte du style OpenFreeMap). Distincte de OSM_CREDIT. */
export const MAP_CREDIT = "OpenFreeMap © OpenMapTiles Data from OpenStreetMap";

/** Fournisseur de fond de carte actuel (`VITE_MAP_STYLE_URL` = OpenFreeMap). À
 * aligner si le fournisseur change. */
export const MAP_PROVIDER_LINKS = [
  { label: "OpenFreeMap", href: "https://openfreemap.org" },
  { label: "OpenMapTiles", href: "https://openmaptiles.org" },
] as const;
