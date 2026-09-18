import { describe, expect, it } from "vitest";
import type { Park } from "@toboggo/shared";
import { selectContextualCarousel } from "./contextualCarousel";

type NearbyPark = Park & { distance_m: number };

function park(id: string, distance_m: number, ageMin: number | null, ageMax: number | null): NearbyPark {
  return { id, distance_m, age_min: ageMin, age_max: ageMax } as NearbyPark;
}

describe("selectContextualCarousel", () => {
  it("prioritizes the children filter when it matches nearby parks", () => {
    const parks = [park("a", 100, 6, 12), park("b", 200, 0, 2)];
    const result = selectContextualCarousel(parks, ["a", "b"], true, [7]);
    expect(result?.titleKey).toBe("sheet.forChildrenNearby");
    expect(result?.parks.map((p) => p.id)).toEqual(["a"]);
  });

  it("falls back past an empty children match to favorites nearby", () => {
    // No child age (7) falls in any park's range — forChildren must not win.
    const parks = [park("a", 100, 0, 2), park("b", 200, 0, 2)];
    const result = selectContextualCarousel(parks, ["b"], true, [7]);
    expect(result?.titleKey).toBe("sheet.favoritesNearby");
    expect(result?.parks.map((p) => p.id)).toEqual(["b"]);
  });

  it("shows favorites nearby when the children filter is off", () => {
    const parks = [park("a", 100, 0, 2), park("b", 200, 0, 2), park("c", 50, 0, 2)];
    const result = selectContextualCarousel(parks, ["b"], false, []);
    expect(result?.titleKey).toBe("sheet.favoritesNearby");
    expect(result?.parks.map((p) => p.id)).toEqual(["b"]);
  });

  it("only surfaces favorites that are actually among the nearby parks, not every favorite", () => {
    const parks = [park("a", 100, 0, 2)];
    // "far-away" is a favorite but never appears in the nearby results.
    const result = selectContextualCarousel(parks, ["far-away"], false, []);
    expect(result?.titleKey).toBe("sheet.discoverNearby");
  });

  it("falls back to a proximity-ordered discovery sample with no favorites nearby", () => {
    const parks = [park("a", 300, 0, 2), park("b", 100, 0, 2), park("c", 200, 0, 2)];
    const result = selectContextualCarousel(parks, [], false, []);
    expect(result?.titleKey).toBe("sheet.discoverNearby");
    // Already proximity-ordered upstream — the selection doesn't re-sort.
    expect(result?.parks.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("returns null when there are no nearby parks at all", () => {
    expect(selectContextualCarousel([], ["a"], true, [7])).toBeNull();
  });

  it("caps the discovery fallback at 6 parks", () => {
    const parks = Array.from({ length: 10 }, (_, i) => park(`p${i}`, i * 100, 0, 2));
    const result = selectContextualCarousel(parks, [], false, []);
    expect(result?.parks).toHaveLength(6);
    expect(result?.parks.map((p) => p.id)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5"]);
  });
});
