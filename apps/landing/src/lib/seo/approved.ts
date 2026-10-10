/**
 * Validation éditoriale des pages de ville.
 *
 * Une page de ville est GÉNÉRÉE si et seulement si :
 *   (1) sa ville est dans APPROVED_PLACE_SLUGS (validation éditoriale humaine), ET
 *   (2) elle est éligible (eligibility.ts, source unique des critères).
 * Une ville éligible mais non validée n'a ni page, ni lien, ni entrée de sitemap
 * (elle est seulement signalée dans les logs du build comme « candidate »).
 *
 * Ajouter une ville = une ligne ici, après relecture de ses données.
 */
export const APPROVED_PLACE_SLUGS: readonly string[] = ["millau"];

/** Ville dont les parcs alimentent la section « Des parcs près de chez vous » de la home. */
export const HOME_PLACE_SLUG = "millau";
