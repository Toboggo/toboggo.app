import { describe, expect, it } from "vitest";
import { ParkLocaleError, countryFromTimezone, genericParkNameForCountry, resolveParkLocale } from "../utils/parkLocale";

describe("resolveParkLocale — pays + fuseau depuis les coordonnées", () => {
  it("Manhattan → US / America/New_York", async () => {
    expect(await resolveParkLocale(40.758, -73.9855)).toEqual({ country_code: "US", timezone: "America/New_York" });
  });

  it("autres fuseaux US réels (pas un fuseau unique par pays)", async () => {
    expect(await resolveParkLocale(34.05, -118.24)).toEqual({ country_code: "US", timezone: "America/Los_Angeles" });
    expect(await resolveParkLocale(41.88, -87.63)).toEqual({ country_code: "US", timezone: "America/Chicago" });
  });

  it("FR / ES inchangés (Lyon, Toulouse, Barcelone, Canaries)", async () => {
    expect(await resolveParkLocale(45.764, 4.8357)).toEqual({ country_code: "FR", timezone: "Europe/Paris" });
    expect(await resolveParkLocale(43.6, 1.44)).toEqual({ country_code: "FR", timezone: "Europe/Paris" });
    expect(await resolveParkLocale(41.39, 2.17)).toEqual({ country_code: "ES", timezone: "Europe/Madrid" });
    expect(await resolveParkLocale(28.1, -15.4)).toEqual({ country_code: "ES", timezone: "Atlantic/Canary" });
  });

  it("le pays fourni (reverse geocoding) prime, normalisé en majuscules", async () => {
    expect(await resolveParkLocale(40.758, -73.9855, { country_code: "us" })).toEqual({
      country_code: "US",
      timezone: "America/New_York",
    });
  });

  it("un fuseau fourni n'est pas recalculé", async () => {
    const r = await resolveParkLocale(40.758, -73.9855, { country_code: "US", timezone: "America/Detroit" });
    expect(r.timezone).toBe("America/Detroit");
  });

  it("pays inconnu hors marchés connus ⇒ échec explicite, jamais « FR »", async () => {
    await expect(resolveParkLocale(43.65, -79.38)).rejects.toMatchObject({ reason: "country_unresolved" });
    await expect(resolveParkLocale(43.65, -79.38)).rejects.toBeInstanceOf(ParkLocaleError);
  });

  it("…mais un pays fourni débloque ce même cas (Toronto + CA)", async () => {
    expect(await resolveParkLocale(43.65, -79.38, { country_code: "CA" })).toEqual({
      country_code: "CA",
      timezone: "America/Toronto",
    });
  });

  it("code pays invalide ⇒ ignoré puis déduit du fuseau", async () => {
    expect((await resolveParkLocale(40.758, -73.9855, { country_code: "USA" })).country_code).toBe("US");
  });

  it("coordonnées invalides ⇒ erreur typée", async () => {
    await expect(resolveParkLocale(999, 4)).rejects.toMatchObject({ reason: "invalid_coordinates" });
    await expect(resolveParkLocale(Number.NaN, 4)).rejects.toMatchObject({ reason: "invalid_coordinates" });
  });
});

describe("helpers", () => {
  it("countryFromTimezone — outre-mer FR, US multi-zones, inconnu", () => {
    expect(countryFromTimezone("Indian/Reunion")).toBe("FR");
    expect(countryFromTimezone("America/Indiana/Indianapolis")).toBe("US");
    expect(countryFromTimezone("Pacific/Honolulu")).toBe("US");
    expect(countryFromTimezone("America/Toronto")).toBeNull();
    expect(countryFromTimezone("UTC")).toBeNull();
  });

  it("genericParkNameForCountry — Playground aux US, Aire de jeux sinon (FR/ES inchangés)", () => {
    expect(genericParkNameForCountry("US")).toBe("Playground");
    expect(genericParkNameForCountry("us")).toBe("Playground");
    expect(genericParkNameForCountry("FR")).toBe("Aire de jeux");
    expect(genericParkNameForCountry("ES")).toBe("Aire de jeux");
    expect(genericParkNameForCountry(null)).toBe("Aire de jeux");
  });
});
