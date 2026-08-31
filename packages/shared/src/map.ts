/**
 * Cartographie — configuration *provider-agnostic*.
 *
 * Le moteur de rendu est MapLibre GL JS (instancié dans chaque app). Le fond de
 * carte est décrit par une URL de style (spec « MapLibre Style », JSON v8) lue
 * depuis `VITE_MAP_STYLE_URL`. Le fournisseur retenu au démarrage est OpenFreeMap
 * (gratuit, sans clé, tuiles dérivées d'OpenStreetMap), mais AUCUN fournisseur
 * n'est codé en dur : changer la variable d'environnement suffit à basculer vers
 * MapTiler, Protomaps, un style self-host, etc.
 *
 * Si la variable est absente ou vide, les écrans carte retombent sur un fond
 * stylisé hors-ligne (`FakeMap` côté app parents) — l'app reste fonctionnelle
 * sans aucune configuration cartographique.
 *
 * Attribution : le `AttributionControl` par défaut de MapLibre lit l'attribution
 * fournie par le style / la source de tuiles (OpenFreeMap la fournit déjà,
 * lien « © OpenStreetMap » inclus). On ne la duplique donc pas ici.
 */

/** URL de style de carte configurée (`VITE_MAP_STYLE_URL`), ou `null`. */
export function mapStyleUrl(): string | null {
  const raw = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}
