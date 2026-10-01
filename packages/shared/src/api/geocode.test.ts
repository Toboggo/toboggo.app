import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isExactNameMatch, rankPlaces, searchPlaces, type GeoPlace } from "./geocode";

const place = (name: string, extra: Partial<GeoPlace> = {}): GeoPlace => ({
  id: name,
  name,
  label: name,
  lat: 0,
  lng: 0,
  ...extra,
});

describe("rankPlaces", () => {
  it("puts an exact name match before prefix / partial / other matches (accent- and case-insensitive)", () => {
    const ranked = rankPlaces("Barcelone", [
      place("Barcelonais"),
      place("Gare de Barcelone"),
      place("Barcelonette"),
      place("barcelone"),
    ]);
    expect(ranked.map((p) => p.name)).toEqual(["barcelone", "Barcelonette", "Gare de Barcelone", "Barcelonais"]);
  });

  it("ignores accents when matching", () => {
    expect(rankPlaces("Orleans", [place("Orléansville"), place("Orléans")])[0].name).toBe("Orléans");
  });

  it("keeps the provider order between equally relevant places (stable)", () => {
    const es = place("Barcelone", { id: "es" });
    const ve = place("Barcelone", { id: "ve" });
    expect(rankPlaces("Barcelone", [es, ve]).map((p) => p.id)).toEqual(["es", "ve"]);
    expect(rankPlaces("Barcelone", [ve, es]).map((p) => p.id)).toEqual(["ve", "es"]);
  });

  it("is generic — no city-specific rule", () => {
    expect(rankPlaces("Madrid", [place("Madridejos"), place("Madrid")])[0].name).toBe("Madrid");
  });
});

describe("isExactNameMatch", () => {
  it("ignores case, accents and surrounding / repeated spaces", () => {
    expect(isExactNameMatch("toulouse", "Toulouse")).toBe(true);
    expect(isExactNameMatch("TOULOUSE", "Toulouse")).toBe(true);
    expect(isExactNameMatch("  Toulouse ", "Toulouse")).toBe(true);
    expect(isExactNameMatch("Orleans", "Orléans")).toBe(true);
    expect(isExactNameMatch("saint  denis", "Saint-Denis")).toBe(false); // punctuation is not normalised away
  });

  it("rejects prefixes, inclusions and empty queries", () => {
    expect(isExactNameMatch("Toulouse", "Toulouse-Lautrec")).toBe(false);
    expect(isExactNameMatch("Toulouse", "Gare de Toulouse")).toBe(false);
    expect(isExactNameMatch("", "")).toBe(false);
  });
});

describe("searchPlaces", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_MAPTILER_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const respond = (features: unknown[], ok = true, status = 200) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => ({ features }) }));

  it("builds a « region, country » context from the provider, never inventing one", async () => {
    respond([
      {
        id: "a",
        text: "Barcelone",
        place_name: "Barcelone, Espagne",
        center: [2.17, 41.38],
        bbox: [2.05, 41.32, 2.23, 41.47],
        place_type: ["municipality"],
        context: [{ text: "Barcelone" }, { text: "Catalogne" }, { text: "Espagne" }],
      },
      { id: "b", text: "Paris", place_name: "Paris, France", center: [2.35, 48.85] },
    ]);
    const [barcelona, paris] = await searchPlaces("Barcelone");
    expect(barcelona.context).toBe("Catalogne, Espagne");
    expect(barcelona.bbox).toEqual([2.05, 41.32, 2.23, 41.47]);
    expect(paris.context).toBeUndefined(); // no context from provider → UI falls back to label
  });

  it("keeps the full label for precise results (address / neighbourhood)", async () => {
    respond([
      {
        id: "c",
        text: "12 Rue X",
        place_name: "12 Rue X, Millau, France",
        center: [3, 44],
        place_type: ["address"],
        context: [{ text: "Millau" }, { text: "Occitanie" }, { text: "France" }],
      },
    ]);
    expect((await searchPlaces("12 rue x"))[0].context).toBeUndefined();
  });

  it("returns [] on HTTP error by default, throws with throwOnError", async () => {
    respond([], false, 500);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await searchPlaces("x1")).toEqual([]);
    await expect(searchPlaces("x1", undefined, undefined, { throwOnError: true })).rejects.toThrow();
  });
});
