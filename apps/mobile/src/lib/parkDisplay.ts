import { AGE_BAND_LABEL, type Park } from "@toboggo/shared";

/**
 * Presentation guards for park data that is often absent on real (OSM-sourced)
 * parks. The generated Supabase types mark these columns non-nullable, but the
 * `nearby_parks` RPC returns `null` for un-tagged playgrounds — so we treat them
 * as nullable here and never render a fabricated value.
 */

type RatingLike = { rating?: number | null; review_count?: number | null };
type AgeLike = { age_min?: number | null; age_max?: number | null };

/** A park has a real rating only once at least one review backs it. */
export function hasRating(p: RatingLike): boolean {
  return (p.review_count ?? 0) > 0 && (p.rating ?? 0) > 0;
}

/**
 * The age-band label, or `null` when the age range is unknown — so the UI can
 * omit it rather than presenting a guessed band as a fact.
 */
export function ageBandLabel(p: AgeLike): string | null {
  const lo = p.age_min;
  const hi = p.age_max;
  if (lo == null || hi == null) return null;
  if (lo === 0 && hi >= 12) return AGE_BAND_LABEL.all;
  if (hi <= 3) return AGE_BAND_LABEL.under3;
  if (lo >= 6) return AGE_BAND_LABEL["6-12"];
  return AGE_BAND_LABEL["3-6"];
}

/** Explicit age range (`"2–8 ans"`), or `null` when unknown. */
export function ageRangeLabel(p: AgeLike): string | null {
  if (p.age_min == null || p.age_max == null) return null;
  return `${p.age_min}–${p.age_max} ans`;
}

/** Up to two decision-relevant, actually-present attributes. */
export function keyAttributes(p: Pick<Park, "fenced" | "shade" | "wc" | "pmr">): string[] {
  const out: string[] = [];
  if (p.fenced) out.push("Clôturé");
  if (p.shade) out.push("Ombragé");
  if (p.wc) out.push("WC");
  if (p.pmr) out.push("PMR");
  return out.slice(0, 2);
}
