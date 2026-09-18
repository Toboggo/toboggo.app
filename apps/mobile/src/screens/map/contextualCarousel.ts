import type { Park } from "@toboggo/shared";

type NearbyPark = Park & { distance_m: number };

export type ContextualCarouselTitleKey = "sheet.forChildrenNearby" | "sheet.favoritesNearby" | "sheet.discoverNearby";
export type ContextualCarouselSubtitleKey =
  | "sheet.forChildrenNearbySubtitle"
  | "sheet.favoritesNearbySubtitle"
  | "sheet.discoverNearbySubtitle";

export interface ContextualCarousel {
  titleKey: ContextualCarouselTitleKey;
  subtitleKey: ContextualCarouselSubtitleKey;
  parks: NearbyPark[];
}

// Small, fixed sample for the "discover" fallback — enough to browse, short
// enough to still read as a taste rather than a second list.
const DISCOVER_LIMIT = 6;

/**
 * Picks the single carousel shown under the filters on Explore — built
 * entirely from data already loaded there (no new query, no scoring). Falls
 * through to the next tier whenever one is empty, so the sheet never shows an
 * empty section under an active title.
 *
 * Priority: the children filter (same age-range check as `ParkList`) > the
 * user's favorites that are already among the nearby results > a
 * proximity-ordered sample of the nearby results (already sorted by
 * `distance_m` server-side).
 */
export function selectContextualCarousel(
  parks: NearbyPark[],
  favoriteIds: string[],
  forChildren: boolean,
  childAges: number[],
): ContextualCarousel | null {
  if (parks.length === 0) return null;

  if (forChildren && childAges.length > 0) {
    const forKids = parks.filter((p) => {
      // A park with no recorded age range is never assumed compatible.
      if (p.age_min == null || p.age_max == null) return false;
      return childAges.some((a) => a >= p.age_min! && a <= p.age_max!);
    });
    if (forKids.length > 0) {
      return { titleKey: "sheet.forChildrenNearby", subtitleKey: "sheet.forChildrenNearbySubtitle", parks: forKids };
    }
  }

  if (favoriteIds.length > 0) {
    const favSet = new Set(favoriteIds);
    const favNearby = parks.filter((p) => favSet.has(p.id));
    if (favNearby.length > 0) {
      return { titleKey: "sheet.favoritesNearby", subtitleKey: "sheet.favoritesNearbySubtitle", parks: favNearby };
    }
  }

  return {
    titleKey: "sheet.discoverNearby",
    subtitleKey: "sheet.discoverNearbySubtitle",
    parks: parks.slice(0, DISCOVER_LIMIT),
  };
}
