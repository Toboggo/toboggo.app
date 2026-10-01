import type { Park } from "@toboggo/shared";
import { SUGGESTION_RADIUS_KM, FETCH_RADIUS_KM } from "../../lib/nearbyRadius";

export type NearbyPark = Park & { distance_m: number };

/** Contextual filters of the "Autour de vous" section, in display order. */
export type NearbyContext = "nearby" | "favorites" | "forChildren";

/** The medium-snap carousel is a taste of the zone, never the whole list. */
export const CAROUSEL_LIMIT = 8;

const km = (radiusKm: number) => radiusKm * 1000;

/**
 * Ranking of the nearby results. V1 = real distance only, nothing else — the
 * RPC already returns rows by `distance_m`, re-sorting here just makes the
 * contract explicit and local. This is the single place a future relevance
 * score (rating, photos, completeness, children's ages, equipment,
 * favorites…) would plug in; no such score exists yet.
 */
export function rankNearby<T extends { distance_m: number }>(parks: T[]): T[] {
  return [...parks].sort((a, b) => a.distance_m - b.distance_m);
}

/** A park with no recorded age range is never assumed compatible. */
export function suitsChildren(p: Pick<Park, "age_min" | "age_max">, childAges: number[]): boolean {
  if (p.age_min == null || p.age_max == null) return false;
  return childAges.some((a) => a >= p.age_min! && a <= p.age_max!);
}

/**
 * Filters actually usable for this user: "Favoris" needs an account (hidden,
 * not login-gated, for guests), "Pour mes enfants" needs at least one child
 * with a known age — the same condition `ParkList` uses for its own chip.
 */
export function availableContexts(isLoggedIn: boolean, childAges: number[]): NearbyContext[] {
  const out: NearbyContext[] = ["nearby"];
  if (isLoggedIn) out.push("favorites");
  if (childAges.length > 0) out.push("forChildren");
  return out;
}

export interface NearbySelection {
  /** Every park within the active radius, ranked — drives the count and the expanded list. */
  activeParks: NearbyPark[];
  /** The context actually applied (falls back to "nearby" when the chosen one isn't available). */
  context: NearbyContext;
  /** `activeParks` narrowed by the contextual filter. */
  contextParks: NearbyPark[];
  /** At most `CAROUSEL_LIMIT` of `contextParks`. */
  carousel: NearbyPark[];
  /**
   * Only when the active zone is empty: real parks beyond it but within
   * `SUGGESTION_RADIUS_KM`. Never used to fill a zone that has results.
   */
  suggestions: NearbyPark[];
  /** Loaded parks exist beyond the active radius (and it can still grow). */
  hasMoreBeyond: boolean;
}

/**
 * Pure derivation of everything the "Autour de vous" section shows, from the
 * parks already loaded (up to `FETCH_RADIUS_KM`). No query, no scoring, and
 * never a change of the user's radius.
 */
export function selectNearby(params: {
  parks: NearbyPark[];
  radiusKm: number;
  context: NearbyContext;
  favoriteIds: string[];
  childAges: number[];
  isLoggedIn: boolean;
}): NearbySelection {
  const { parks, radiusKm, favoriteIds, childAges, isLoggedIn } = params;
  const limit = km(radiusKm);
  const ranked = rankNearby(parks);
  const activeParks = ranked.filter((p) => p.distance_m <= limit);

  const context = availableContexts(isLoggedIn, childAges).includes(params.context) ? params.context : "nearby";
  let contextParks = activeParks;
  if (context === "favorites") {
    const favSet = new Set(favoriteIds);
    contextParks = activeParks.filter((p) => favSet.has(p.id));
  } else if (context === "forChildren") {
    contextParks = activeParks.filter((p) => suitsChildren(p, childAges));
  }

  const suggestions =
    activeParks.length === 0 && radiusKm < SUGGESTION_RADIUS_KM
      ? ranked
          .filter((p) => p.distance_m > limit && p.distance_m <= km(SUGGESTION_RADIUS_KM))
          .slice(0, CAROUSEL_LIMIT)
      : [];

  return {
    activeParks,
    context,
    contextParks,
    carousel: contextParks.slice(0, CAROUSEL_LIMIT),
    suggestions,
    hasMoreBeyond: radiusKm < FETCH_RADIUS_KM && ranked.some((p) => p.distance_m > limit),
  };
}
