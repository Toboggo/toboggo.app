import { describe, expect, it } from "vitest";
import type { ReverseGeocodedAddress } from "@toboggo/shared";
import { addressToParkInput, applyResolvedAddress, formatLocality, localityFor } from "./addressDraft";

const A: ReverseGeocodedAddress = {
  address_line: "12 Rue de la Capelle",
  postal_code: "12100",
  city: "Millau",
  admin_area_1: "Occitanie",
  admin_area_2: "Aveyron",
  country_code: "FR",
  formatted: null,
};
const P1 = { lat: 44.1, lng: 3.1 };
const P2 = { lat: 45.7, lng: 4.8 };

describe("applyResolvedAddress", () => {
  it("remplit un champ vide et pose la localité avec sa position", () => {
    const r = applyResolvedAddress({ address: "" }, A, P1);
    expect(r.address).toBe("12 Rue de la Capelle");
    expect(r.addressEdited).toBe(false);
    expect(r.locality).toMatchObject({ postal_code: "12100", city: "Millau", country_code: "FR", ...P1 });
  });

  it("remplace une adresse automatique (non éditée) après un nouveau déplacement", () => {
    expect(applyResolvedAddress({ address: "Ancienne", addressEdited: false }, A, P1).address).toBe("12 Rue de la Capelle");
  });

  it("nouveau pin sans rue → l'ancienne rue AUTOMATIQUE est supprimée (jamais associée à la nouvelle ville)", () => {
    const r = applyResolvedAddress({ address: "12 Rue de la Capelle", addressEdited: false }, { ...A, address_line: null, city: "Lyon" }, P2);
    expect(r.address).toBe("");
    expect(r.locality?.city).toBe("Lyon");
  });

  it("rue saisie à la main → conservée même sans rue dans le résultat ; la localité suit le pin", () => {
    const r = applyResolvedAddress({ address: "Ma correction", addressEdited: true }, { ...A, address_line: null, city: "Lyon" }, P2);
    expect(r.address).toBe("Ma correction");
    expect(r.addressEdited).toBe(true);
    expect(r.locality).toMatchObject({ city: "Lyon", ...P2 });
  });

  it("ne remplace jamais une adresse saisie à la main par la rue du résultat", () => {
    expect(applyResolvedAddress({ address: "Ma correction", addressEdited: true }, A, P1).address).toBe("Ma correction");
  });

  it("un champ « édité » mais vidé redevient remplissable", () => {
    expect(applyResolvedAddress({ address: "  ", addressEdited: true }, A, P1).address).toBe("12 Rue de la Capelle");
  });
});

describe("localityFor / addressToParkInput", () => {
  const resolved = applyResolvedAddress({ address: "" }, A, P1);

  it("la localité n'est valable que pour la position pour laquelle elle a été résolue", () => {
    expect(localityFor(resolved, P1)?.city).toBe("Millau");
    expect(localityFor(resolved, P2)).toBeNull();
  });

  it("ancienne localité + nouvelles coordonnées → localité absente du payload", () => {
    const input = addressToParkInput(resolved, P2);
    expect(input).toEqual({ address_line: "12 Rue de la Capelle" });
    expect(input).not.toHaveProperty("city");
    expect(input).not.toHaveProperty("postal_code");
  });

  it("localité sans position (ancien brouillon) → jamais envoyée", () => {
    const legacy = { address: "", locality: { postal_code: "1", city: "X", admin_area_1: null, admin_area_2: null, country_code: "FR" } };
    expect(localityFor(legacy, P1)).toBeNull();
  });

  it("n'envoie que les champs réellement connus, pour la bonne position", () => {
    expect(addressToParkInput({ address: "", locality: null }, P1)).toEqual({});
    expect(addressToParkInput(resolved, P1)).toEqual({
      address_line: "12 Rue de la Capelle",
      postal_code: "12100",
      city: "Millau",
      admin_area_1: "Occitanie",
      admin_area_2: "Aveyron",
      country_code: "FR",
    });
  });

  it("formate « code postal ville »", () => {
    expect(formatLocality(resolved.locality)).toBe("12100 Millau");
    expect(formatLocality(null)).toBe("");
  });
});
