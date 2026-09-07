import { FEATURE_LABEL, type Feature, type FeatureCategory } from "@toboggo/shared";

/**
 * BO-local completion of the vocabulary for the Caractéristiques tab (Lot 3C.2).
 *
 * The shared `FEATURE_LABEL` covers 25 of the 33 catalogue codes; the 8 play
 * codes below are the remainder (never surface a raw `code.replace(/_/g," ")`
 * to a collectivité). `equipmentLabels.ts` is deliberately left untouched, and
 * nothing here changes the mobile vocabulary.
 */
const EXTRA_FEATURE_LABEL: Record<string, string> = {
  play_structure: "Structure multi-jeux",
  seesaw: "Jeu à bascule",
  playhouse: "Cabane de jeu",
  trampoline: "Trampoline",
  balance_beam: "Poutre d'équilibre",
  agility_trail: "Parcours de motricité",
  horizontal_bar: "Barre fixe",
  hopscotch: "Marelle",
};

export function featureLabelBO(code: string): string {
  return FEATURE_LABEL[code] ?? EXTRA_FEATURE_LABEL[code] ?? code.replace(/_/g, " ");
}

/**
 * Human labels for the `value_set` of the 3 multi-value `environment` features.
 * Verified against the live catalogue — no value outside it is assumed. The
 * `"unknown"` member is intentionally absent: in the UI "Non renseigné" means
 * *remove the row*, never "write value = unknown".
 */
export const FEATURE_VALUE_LABEL: Record<string, Record<string, string>> = {
  fence_status: {
    fully_fenced: "Entièrement clôturé",
    partially_fenced: "Partiellement clôturé",
    not_fenced: "Non clôturé",
  },
  shade_level: {
    none: "Aucune ombre",
    partial: "Partiellement ombragé",
    mostly_shaded: "Majoritairement ombragé",
    fully_shaded: "Entièrement ombragé",
  },
  surface_type: {
    rubber: "Sol souple (caoutchouc)",
    sand: "Sable",
    grass: "Herbe / gazon",
    wood_chips: "Copeaux de bois",
    gravel: "Gravier",
    concrete: "Béton / bitume",
    mixed: "Mixte",
  },
};

export function featureValueLabelBO(code: string, value: string): string {
  return FEATURE_VALUE_LABEL[code]?.[value] ?? value.replace(/_/g, " ");
}

export const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  play: "Jeux",
  service: "Services",
  accessibility: "Accessibilité",
  environment: "Environnement / Aménagement",
  safety: "Sécurité",
};

/** Display order. `safety` is excluded — the catalogue has 0 active safety
 * features, so the category is never shown (Lot 3C.2 decision). */
export const CATEGORY_ORDER: Exclude<FeatureCategory, "safety">[] = [
  "play",
  "service",
  "accessibility",
  "environment",
];

export interface FeatureGroup {
  category: FeatureCategory;
  label: string;
  features: Feature[];
}

export function groupFeatures(catalogue: Feature[]): FeatureGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    features: catalogue.filter((f) => f.category === category).sort((a, b) => a.sort_order - b.sort_order),
  })).filter((g) => g.features.length > 0);
}

/** A feature carrying a `value_set` is edited as a single choice, not a
 * yes/no/unknown triplet. */
export function isValueFeature(feature: Feature): boolean {
  return Array.isArray(feature.value_set) && feature.value_set.length > 0;
}

/** Human-labelled `value_set` options, minus the `"unknown"` sentinel. */
export function humanValueOptions(feature: Feature): { value: string; label: string }[] {
  return (feature.value_set ?? [])
    .filter((v) => v !== "unknown")
    .map((v) => ({ value: v, label: featureValueLabelBO(feature.code, v) }));
}
