import type { Park } from "@toboggo/shared";

/**
 * "Complétude" d'une fiche parc (COLL-03) — un indicateur d'action, jamais une
 * note : combien des 5 informations clés sont renseignées, et lesquelles
 * restent à compléter. Fonction pure, calculée à partir des champs réellement
 * présents sur `park_public` ; rien n'est stocké et rien n'est inventé.
 */
export type CompletenessKey = "address" | "ages" | "description" | "photo" | "features";

export const COMPLETENESS_LABEL: Record<CompletenessKey, string> = {
  address: "Adresse",
  ages: "Tranche d'âge",
  description: "Description",
  photo: "Photo",
  features: "Caractéristiques",
};

const ORDER: CompletenessKey[] = ["address", "ages", "description", "photo", "features"];

export interface Completeness {
  /** Informations renseignées (0..total). */
  filled: number;
  total: number;
  /** Informations à compléter, dans l'ordre d'affichage. */
  missing: CompletenessKey[];
  items: { key: CompletenessKey; label: string; done: boolean }[];
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** A characteristic counts as "renseignée" only when someone actually stated
 * something: a status other than `unknown`, or a real (non-`unknown`) value.
 * A missing row means "non renseigné", never "absent". */
function hasRecordedFeature(features: Park["features"] | null | undefined): boolean {
  if (!features) return false;
  return Object.values(features).some(
    (f) => (f.status != null && f.status !== "unknown") || (f.value != null && f.value !== "unknown"),
  );
}

type CompletenessInput = Pick<
  Park,
  "address_line" | "formatted_address" | "min_age" | "max_age" | "description" | "cover_photo" | "photos" | "features"
>;

export function computeCompleteness(park: CompletenessInput): Completeness {
  const done: Record<CompletenessKey, boolean> = {
    address: hasText(park.address_line) || hasText(park.formatted_address),
    // `0` is a real age (« dès la naissance ») — only null/undefined mean "non renseigné".
    ages: park.min_age != null || park.max_age != null,
    description: hasText(park.description),
    photo: hasText(park.cover_photo) || (park.photos?.length ?? 0) > 0,
    features: hasRecordedFeature(park.features),
  };
  const items = ORDER.map((key) => ({ key, label: COMPLETENESS_LABEL[key], done: done[key] }));
  const missing = items.filter((i) => !i.done).map((i) => i.key);
  return { filled: ORDER.length - missing.length, total: ORDER.length, missing, items };
}
