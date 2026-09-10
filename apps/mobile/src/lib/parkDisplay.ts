import { type Park } from "@toboggo/shared";

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
