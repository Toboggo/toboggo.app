import { type Park } from "@toboggo/shared";
import { equipmentIcon, serviceIcon, type IconName } from "@toboggo/design-system";

/**
 * Presentation guards for park data that is often absent on real (OSM-sourced)
 * parks. The generated Supabase types mark these columns non-nullable, but the
 * `nearby_parks` RPC returns `null` for un-tagged playgrounds — so we treat them
 * as nullable here and never render a fabricated value.
 *
 * These helpers return **codes / keys**, never user-facing text — the i18n layer
 * (`useFormat`, `useFeatureLabel`) turns them into localized strings.
 */

type RatingLike = { rating?: number | null; review_count?: number | null };
type AgeLike = { age_min?: number | null; age_max?: number | null };

/** A park has a real rating only once at least one review backs it. */
export function hasRating(p: RatingLike): boolean {
  return (p.review_count ?? 0) > 0 && (p.rating ?? 0) > 0;
}

/** Explicit age range as a `{ min, max }` pair, or `null` when unknown. */
export function ageRange(p: AgeLike): { min: number; max: number } | null {
  if (p.age_min == null || p.age_max == null) return null;
  return { min: p.age_min, max: p.age_max };
}

/**
 * Up to two decision-relevant, actually-present attributes, as `features:attr.*`
 * keys — the card component translates them.
 */
export function keyAttributes(
  p: Pick<Park, "fenced" | "shade" | "wc" | "pmr">,
): ("fenced" | "shaded" | "toilets" | "accessible")[] {
  const out: ("fenced" | "shaded" | "toilets" | "accessible")[] = [];
  if (p.fenced) out.push("fenced");
  if (p.shade) out.push("shaded");
  if (p.wc) out.push("toilets");
  if (p.pmr) out.push("accessible");
  return out.slice(0, 2);
}

const SERVICE_KEYS = ["wc", "shade", "fenced", "pmr", "benches", "water", "parking"] as const;

export interface EquipmentChip {
  /** Raw catalogue code (`park.play_equipment` entry or service key) — resolve
   * to a label via `useFeatureLabel()`. */
  code: string;
  icon: IconName;
}

/**
 * Play-equipment + amenity codes actually present on the park, in a stable
 * order (equipment first, then amenities), restricted to codes that already
 * have a validated sprite icon (`equipmentIcon`/`serviceIcon`) — a code
 * without one is simply left out here rather than falling back to an emoji,
 * so the caller's overflow count ("+X") stays honest about everything real
 * that isn't shown, whether because of the 3-chip cap or a missing icon.
 */
export function equipmentChips(
  p: Pick<Park, "play_equipment" | "wc" | "shade" | "fenced" | "pmr" | "benches" | "water" | "parking">,
): EquipmentChip[] {
  const fromEquipment = (p.play_equipment ?? []).flatMap((code) => {
    const icon = equipmentIcon(code);
    return icon ? [{ code, icon }] : [];
  });
  const fromServices = SERVICE_KEYS.filter((code) => p[code]).flatMap((code) => {
    const icon = serviceIcon(code);
    return icon ? [{ code, icon }] : [];
  });
  return [...fromEquipment, ...fromServices];
}
