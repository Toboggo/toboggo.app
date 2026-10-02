import { describe, expect, it } from "vitest";
import { park } from "./fixtures";
import { groupPlaces, normalizeCityKey, pickDisplayName, placePath } from "./places";

describe("normalizeCityKey", () => {
  it("merges accent / case / particle variants of the same commune", () => {
    expect(normalizeCityKey("Onet-Le-Chateau")).toBe("onet-le-chateau");
    expect(normalizeCityKey("Onet-le-Château")).toBe("onet-le-chateau");
    expect(normalizeCityKey("L'Union")).toBe("l-union");
    expect(normalizeCityKey("L’Union")).toBe("l-union");
    expect(normalizeCityKey("  Saint-Orens-de-Gameville ")).toBe("saint-orens-de-gameville");
  });
});

describe("pickDisplayName", () => {
  it("prefers accents and lowercase particles over raw frequency", () => {
    const counts = new Map([
      ["Onet-Le-Chateau", 25],
      ["Onet-le-Château", 23],
    ]);
    expect(pickDisplayName(counts)).toBe("Onet-le-Château");
  });

  it("falls back to frequency when variants are equivalent", () => {
    expect(pickDisplayName(new Map([["Millau", 3], ["MILLAU", 9]]))).toBe("MILLAU");
  });
});

describe("groupPlaces", () => {
  it("fuses the Onet-le-Château variants into one place and keeps both spellings", () => {
    const places = groupPlaces([
      ...Array.from({ length: 3 }, () => park({ city: "Onet-Le-Chateau", postalCode: "12850" })),
      ...Array.from({ length: 2 }, () => park({ city: "Onet-le-Château", postalCode: "12850" })),
    ]);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ slug: "onet-le-chateau", name: "Onet-le-Château", parks: expect.any(Array) });
    expect(places[0].parks).toHaveLength(5);
    expect(places[0].variants).toEqual(["Onet-Le-Chateau", "Onet-le-Château"]);
    expect(places[0].placeId).toBeNull();
  });

  it("ignores parks without a city and never invents places", () => {
    expect(groupPlaces([park({ city: null }), park({ city: "  " })])).toEqual([]);
  });

  it("splits homonymous communes of different departments (slug suffixed)", () => {
    const places = groupPlaces([park({ city: "Saint-Léons", postalCode: "12780" }), park({ city: "Saint-Léons", postalCode: "31000" })]);
    expect(places.map((p) => p.slug)).toEqual(["saint-leons-12", "saint-leons-31"]);
  });

  it("is deterministic regardless of input order", () => {
    const a = park({ city: "Albi", postalCode: "81000" });
    const b = park({ city: "Millau" });
    expect(groupPlaces([a, b]).map((p) => p.slug)).toEqual(groupPlaces([b, a]).map((p) => p.slug));
  });

  it("builds trailing-slash paths", () => {
    expect(placePath({ slug: "millau" })).toBe("/aires-de-jeux/millau/");
  });
});
