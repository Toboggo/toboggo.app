import { beforeEach, describe, expect, it } from "vitest";
import { availableContexts, CAROUSEL_LIMIT, rankNearby, selectNearby, type NearbyPark } from "./nearbySelection";
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS_KM, useNearbyRadius } from "../../lib/nearbyRadius";

// Test fixtures only (typed shape, never shipped) — just the fields the selector reads.
function park(id: string, distance_m: number, ageMin: number | null = null, ageMax: number | null = null): NearbyPark {
  return { id, distance_m, age_min: ageMin, age_max: ageMax } as NearbyPark;
}

const base = { context: "nearby" as const, favoriteIds: [], childAges: [], isLoggedIn: false };

describe("useNearbyRadius", () => {
  beforeEach(() => useNearbyRadius.setState({ radiusKm: DEFAULT_RADIUS_KM }));

  it("defaults to 2 km", () => {
    expect(DEFAULT_RADIUS_KM).toBe(2);
    expect(useNearbyRadius.getState().radiusKm).toBe(2);
  });

  it("offers exactly 1 / 2 / 5 / 10 / 20 km", () => {
    expect([...RADIUS_OPTIONS_KM]).toEqual([1, 2, 5, 10, 20]);
  });

  it("keeps an explicit choice", () => {
    useNearbyRadius.getState().setRadiusKm(5);
    expect(useNearbyRadius.getState().radiusKm).toBe(5);
  });
});

describe("selectNearby — active radius", () => {
  const parks = [park("a", 400), park("b", 950), park("c", 1800), park("d", 4200), park("e", 9000), park("f", 15000)];

  it.each([
    [1, 2],
    [2, 3],
    [5, 4],
    [10, 5],
    [20, 6],
  ])("at %i km the count is %i", (radiusKm, expected) => {
    expect(selectNearby({ ...base, parks, radiusKm }).activeParks).toHaveLength(expected);
  });

  it("includes a park exactly on the radius", () => {
    expect(selectNearby({ ...base, parks: [park("edge", 2000)], radiusKm: 2 }).activeParks).toHaveLength(1);
  });

  it("ranks by real distance, whatever the input order", () => {
    const shuffled = [park("far", 1500), park("near", 100), park("mid", 700)];
    expect(selectNearby({ ...base, parks: shuffled, radiusKm: 2 }).carousel.map((p) => p.id)).toEqual([
      "near",
      "mid",
      "far",
    ]);
    expect(rankNearby(shuffled)).not.toBe(shuffled); // never mutates the cached query data
  });
});

describe("selectNearby — carousel", () => {
  it(`caps the carousel at ${CAROUSEL_LIMIT} even with many results, while the count stays total`, () => {
    const many = Array.from({ length: 62 }, (_, i) => park(`p${i}`, 20 + i * 25));
    const s = selectNearby({ ...base, parks: many, radiusKm: 2 });
    expect(s.activeParks).toHaveLength(62);
    expect(s.carousel).toHaveLength(8);
  });

  it("shows only the parks available when fewer than the cap", () => {
    const four = [park("a", 100), park("b", 300), park("c", 600), park("d", 1200), park("far", 6000)];
    const s = selectNearby({ ...base, parks: four, radiusKm: 2 });
    expect(s.carousel.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(s.suggestions).toEqual([]); // a non-empty zone is never padded from further away
  });
});

describe("selectNearby — suggestions further away", () => {
  const farOnly = [park("x", 3200), park("y", 5600), park("z", 7400), park("out", 12000)];

  it("suggests real parks between the radius and 10 km when the zone is empty", () => {
    const s = selectNearby({ ...base, parks: farOnly, radiusKm: 2 });
    expect(s.activeParks).toEqual([]);
    expect(s.suggestions.map((p) => p.id)).toEqual(["x", "y", "z"]);
  });

  it("has no suggestion when nothing exists up to 10 km", () => {
    const s = selectNearby({ ...base, parks: [park("out", 12000)], radiusKm: 2 });
    expect(s.suggestions).toEqual([]);
    expect(s.hasMoreBeyond).toBe(true);
  });

  it("does not suggest once the zone is already 10 km or more", () => {
    expect(selectNearby({ ...base, parks: [park("out", 12000)], radiusKm: 10 }).suggestions).toEqual([]);
  });

  it("never touches the active radius", () => {
    useNearbyRadius.setState({ radiusKm: 2 });
    selectNearby({ ...base, parks: farOnly, radiusKm: useNearbyRadius.getState().radiusKm });
    expect(useNearbyRadius.getState().radiusKm).toBe(2);
  });
});

describe("selectNearby — hasMoreBeyond", () => {
  it("is true only when loaded parks exist beyond the radius", () => {
    expect(selectNearby({ ...base, parks: [park("a", 500), park("b", 4000)], radiusKm: 2 }).hasMoreBeyond).toBe(true);
    expect(selectNearby({ ...base, parks: [park("a", 500)], radiusKm: 2 }).hasMoreBeyond).toBe(false);
  });

  it("is false at the largest radius", () => {
    expect(selectNearby({ ...base, parks: [park("a", 19000)], radiusKm: 20 }).hasMoreBeyond).toBe(false);
  });
});

describe("selectNearby — contextual filters", () => {
  const parks = [park("fav", 300, 3, 6), park("kid", 600, 2, 5), park("other", 900), park("favFar", 4000)];

  it("hides Favoris for guests and shows it once logged in", () => {
    expect(availableContexts(false, [])).toEqual(["nearby"]);
    expect(availableContexts(true, [])).toEqual(["nearby", "favorites"]);
  });

  it("offers Pour mes enfants only with at least one known child age", () => {
    expect(availableContexts(true, [4])).toEqual(["nearby", "favorites", "forChildren"]);
    expect(availableContexts(false, [4])).toEqual(["nearby", "forChildren"]);
  });

  it("never offers Nouveautés nor Populaires", () => {
    const all: string[] = availableContexts(true, [4]);
    expect(all).not.toContain("new");
    expect(all).not.toContain("popular");
  });

  it("Favoris keeps only favorites inside the active zone", () => {
    const s = selectNearby({ ...base, parks, radiusKm: 2, context: "favorites", favoriteIds: ["fav", "favFar"], isLoggedIn: true });
    expect(s.carousel.map((p) => p.id)).toEqual(["fav"]);
    expect(s.activeParks).toHaveLength(3); // the count stays the whole zone
  });

  it("falls back to À proximité when Favoris is requested by a guest", () => {
    const s = selectNearby({ ...base, parks, radiusKm: 2, context: "favorites", favoriteIds: ["fav"] });
    expect(s.context).toBe("nearby");
    expect(s.carousel).toHaveLength(3);
  });

  it("Pour mes enfants keeps only parks whose recorded age range fits a child", () => {
    const s = selectNearby({ ...base, parks, radiusKm: 2, context: "forChildren", childAges: [2] });
    expect(s.carousel.map((p) => p.id)).toEqual(["kid"]);
  });
});
