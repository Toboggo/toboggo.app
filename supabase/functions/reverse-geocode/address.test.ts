import { describe, expect, it } from "vitest";
import { extractAddress, parseCoordinates } from "./address.ts";

describe("extractAddress", () => {
  it("compose une adresse structurée (numéro + rue, ville, régions, pays en majuscules)", () => {
    expect(
      extractAddress({
        results: [
          { housenumber: "12", street: "Rue de la Capelle", postcode: "12100", city: "Millau", state: "Occitanie", county: "Aveyron", country_code: "fr", formatted: "x" },
        ],
      }),
    ).toEqual({
      address_line: "12 Rue de la Capelle",
      postal_code: "12100",
      city: "Millau",
      admin_area_1: "Occitanie",
      admin_area_2: "Aveyron",
      country_code: "FR",
      formatted: "x",
    });
  });

  it("rue seule, village, state_district en repli", () => {
    const r = extractAddress({ results: [{ street: "Chemin du Lac", village: "Creissels", state_district: "Sud" }] });
    expect(r).toMatchObject({ address_line: "Chemin du Lac", city: "Creissels", admin_area_2: "Sud", postal_code: null });
  });

  it("aucun résultat exploitable → null", () => {
    expect(extractAddress({ results: [] })).toBeNull();
    expect(extractAddress({})).toBeNull();
    expect(extractAddress({ results: [{ state: "Occitanie", country_code: "fr" }] })).toBeNull();
  });
});

describe("parseCoordinates", () => {
  it("refuse les coordonnées invalides", () => {
    for (const b of [null, {}, { lat: "44", lng: 3 }, { lat: NaN, lng: 3 }, { lat: 0, lng: 0 }, { lat: 95, lng: 3 }, { lat: 44, lng: 200 }]) {
      expect(parseCoordinates(b)).toBeNull();
    }
    expect(parseCoordinates({ lat: 44.1, lng: 3.1 })).toEqual({ lat: 44.1, lng: 3.1 });
  });
  it("ignore tout champ autre que lat/lng (aucune langue, aucun paramètre libre)", () => {
    expect(parseCoordinates({ lat: 44.1, lng: 3.1, language: "en", url: "https://evil.test" })).toEqual({ lat: 44.1, lng: 3.1 });
    expect(parseCoordinates([44.1, 3.1])).toBeNull();
  });
});
