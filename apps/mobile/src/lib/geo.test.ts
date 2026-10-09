import { describe, expect, it } from "vitest";
import { CITIES, US_CITIES, defaultCenter, detectMarket, suggestedCities } from "./geo";

describe("marché / centre initial — fuseau de l'appareil, jamais la géolocalisation", () => {
  it("fuseaux US → New York (Manhattan), pas Lyon", () => {
    for (const tz of ["America/New_York", "America/Chicago", "America/Los_Angeles", "America/Indiana/Indianapolis"]) {
      expect(detectMarket(tz), tz).toBe("us");
      expect(defaultCenter(tz), tz).toEqual({ lat: 40.758, lng: -73.9855 });
    }
  });

  it("FR / ES / inconnu / hors marché US → Lyon inchangé (pas de régression)", () => {
    for (const tz of ["Europe/Paris", "Europe/Madrid", "UTC", "America/Toronto", "Asia/Tokyo", ""]) {
      expect(detectMarket(tz), tz).toBe("default");
      expect(defaultCenter(tz), tz).toEqual({ lat: 45.764, lng: 4.8357 });
    }
  });

  it("une langue en-US seule ne suffit pas (téléphone américain en France)", () => {
    expect(detectMarket("Europe/Paris")).toBe("default");
  });
});

describe("villes suggérées", () => {
  it("US : villes de l'État de New York, aucune ville française", () => {
    const cities = suggestedCities("America/New_York");
    expect(cities).toBe(US_CITIES);
    expect(cities.map((c) => c.name)).toEqual(expect.arrayContaining(["Manhattan", "Brooklyn", "Queens", "Buffalo"]));
    expect(cities.some((c) => ["Lyon", "Toulouse", "Millau"].includes(c.name))).toBe(false);
  });

  it("autres marchés : liste française historique", () => {
    expect(suggestedCities("Europe/Paris")).toBe(CITIES);
    expect(CITIES[0].name).toBe("Millau");
  });

  it("coordonnées US dans l'emprise de l'État de New York", () => {
    for (const c of US_CITIES) {
      expect(c.lat).toBeGreaterThan(40.4);
      expect(c.lat).toBeLessThan(45.1);
      expect(c.lng).toBeGreaterThan(-79.9);
      expect(c.lng).toBeLessThan(-71.6);
    }
  });
});
