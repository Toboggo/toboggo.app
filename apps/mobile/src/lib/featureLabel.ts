/**
 * Résolution i18n des libellés d'équipements / attributs de parc.
 *
 * Contrat de données : la table Supabase `features` porte `code` (clé neutre :
 * « slide », « swing », « toilets »…) et `label_key` (« feature.<code> »). Les
 * codes en base ne changent jamais ; seule cette couche présentation traduit.
 *
 * Pendant la coexistence V1/V2, la vue `park_public` projette encore des codes
 * V1 (`park.play_equipment` : « toboggan », « waterplay »… ; booléens plats
 * `wc` / `shade` / `fenced` / `pmr` / `water`). `canonicalFeatureCode()` les
 * ramène au code catalogue V2 canonique, **sans toucher aux données ni à la
 * logique des filtres** : c'est une pure normalisation d'affichage.
 */

import { useTranslation } from "react-i18next";

export const FEATURES_NS = "features";

/**
 * Alias code V1 (projeté par `park_public`) → code catalogue V2 canonique.
 * Aligné sur `PLAY_CODE_MAP` / `AMENITY_TO_FEATURE` du write-path
 * (`packages/shared/src/api/parks.ts`), en sens lecture/affichage.
 */
const CANONICAL_CODE: Record<string, string> = {
  // park.play_equipment (codes V1)
  toboggan: "slide",
  springs: "springer",
  waterplay: "water_play",
  motorcourse: "motor_course",
  // booléens d'attributs plats
  wc: "toilets",
  shade: "shade_level",
  fenced: "fence_status",
  pmr: "wheelchair_access",
  water: "drinking_water",
};

export function canonicalFeatureCode(code: string): string {
  return CANONICAL_CODE[code] ?? code;
}

/** Clé i18n canonique d'un code de feature (« toboggan » → « features:slide »). */
export function featureLabelKey(code: string): string {
  return `${FEATURES_NS}:${canonicalFeatureCode(code)}`;
}

function humanize(code: string): string {
  return code.replace(/_/g, " ");
}

/** Hook : renvoie un resolver `(code) => libellé traduit` pour la langue active. */
export function useFeatureLabel(): (code: string) => string {
  const { t } = useTranslation(FEATURES_NS);
  return (code: string) => {
    const canonical = canonicalFeatureCode(code);
    return t(canonical, { defaultValue: humanize(code) });
  };
}
