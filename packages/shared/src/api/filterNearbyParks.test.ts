import { describe, expect, it } from "vitest";
import { filterNearbyParks, parkHasGame } from "./parks";
import type { Park } from "../types";

function park(id: string, over: Partial<Park> = {}): Park {
  return {
    id,
    age_min: 0,
    age_max: 12,
    min_age: 0,
    max_age: 12,
    play_equipment: [],
    features: {},
    wc: false,
    shade: false,
    fenced: false,
    pmr: false,
    benches: false,
    water: false,
    parking: false,
    ...over,
  } as unknown as Park;
}
const feat = (status: "available" | "unknown" | "unavailable") => ({
  status,
  value: null,
  quantity: null,
  category: "play" as const,
  verified_at: null,
});
const ids = (rows: Park[]) => rows.map((p) => p.id);

const SLIDE = park("slide", { features: { slide: feat("available") } });
const SWING = park("swing", { play_equipment: ["swing"] });
const BOTH = park("both", { features: { slide: feat("available"), swing: feat("available") }, wc: true });
const LEGACY = park("legacy", { play_equipment: ["toboggan"] });
const UNKNOWN = park("unknown", { features: { slide: feat("unknown"), swing: feat("unavailable") } });
const ALL = [SLIDE, SWING, BOTH, LEGACY, UNKNOWN];

describe("parkHasGame", () => {
  it("compte seulement une présence positive", () => {
    expect(parkHasGame(UNKNOWN, "slide")).toBe(false);
    expect(parkHasGame(UNKNOWN, "swing")).toBe(false);
    expect(parkHasGame(park("empty"), "slide")).toBe(false);
  });
  it("normalise les codes V1 (toboggan → slide)", () => {
    expect(parkHasGame(LEGACY, "slide")).toBe(true);
  });
});

describe("filterNearbyParks", () => {
  it("aucun choix = aucune restriction", () => {
    expect(ids(filterNearbyParks(ALL, { lat: 0, lng: 0, games: [] }))).toEqual(ids(ALL));
    expect(ids(filterNearbyParks(ALL, { lat: 0, lng: 0 }))).toEqual(ids(ALL));
  });
  it("un jeu", () => {
    expect(ids(filterNearbyParks(ALL, { lat: 0, lng: 0, games: ["slide"] }))).toEqual(["slide", "both", "legacy"]);
  });
  it("plusieurs jeux = ET", () => {
    expect(ids(filterNearbyParks(ALL, { lat: 0, lng: 0, games: ["slide", "swing"] }))).toEqual(["both"]);
  });
  it("sections combinées = ET (jeux + services + âge)", () => {
    expect(ids(filterNearbyParks(ALL, { lat: 0, lng: 0, games: ["slide"], amenities: { wc: true } }))).toEqual(["both"]);
    const young = park("young", { features: { slide: feat("available") }, age_min: 0, age_max: 3, min_age: 0, max_age: 3 });
    expect(ids(filterNearbyParks([young, SLIDE], { lat: 0, lng: 0, games: ["slide"], ageMin: 6, ageMax: 12 }))).toEqual(["slide"]);
  });
  it("un service inconnu (false) n'est pas présent", () => {
    expect(ids(filterNearbyParks(ALL, { lat: 0, lng: 0, amenities: { wc: true } }))).toEqual(["both"]);
  });
});
