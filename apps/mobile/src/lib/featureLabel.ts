/**
 * Résolution i18n des libellés d'équipements / attributs de parc.
 *
 * PRÉPARATION uniquement (Phase 1 / 4) — **non branché** aux filtres ni aux
 * écrans. La logique métier V1/V2 des filtres (`lib/filters.ts`) n'est pas
 * touchée dans cette phase.
 *
 * Contrat de données : la table Supabase `features` porte `code` (clé neutre :
 * « slide », « swing », « toilets »…) et `label_key` (déjà au format
 * « feature.<code> »). Côté app, la traduction passe par le namespace i18n
 * `features` : `t(code)` dans ce namespace. Fallback si la clé manque : le code
 * humanisé — même comportement que `featureLabel()` de `@toboggo/shared`.
 */

import { useTranslation } from "react-i18next";

export const FEATURES_NS = "features";

/** Clé i18n canonique d'un code de feature (« slide » → « features:slide »). */
export function featureLabelKey(code: string): string {
  return `${FEATURES_NS}:${code}`;
}

function humanize(code: string): string {
  return code.replace(/_/g, " ");
}

/**
 * Hook : renvoie un resolver `(code) => libellé traduit` pour la langue active.
 * Exemple d'usage futur : `const label = useFeatureLabel(); label("slide")`.
 */
export function useFeatureLabel(): (code: string) => string {
  const { t } = useTranslation(FEATURES_NS);
  return (code: string) => t(code, { defaultValue: humanize(code) });
}
