import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("../supabaseClient", () => ({ getSupabase: () => ({ functions: { invoke } }) }));

import { reverseGeocode } from "./reverseGeocode";

const ADDR = { address_line: "12 Rue de la Capelle", postal_code: "12100", city: "Millau", admin_area_1: "Occitanie", admin_area_2: "Aveyron", country_code: "FR", formatted: null };

beforeEach(() => invoke.mockReset());

describe("reverseGeocode", () => {
  it("passe par l'Edge Function (clé côté serveur) avec coordonnées seules (aucune langue) et signal", async () => {
    invoke.mockResolvedValue({ data: { address: ADDR }, error: null });
    const signal = new AbortController().signal;
    await expect(reverseGeocode(44.1, 3.1, { signal })).resolves.toEqual(ADDR);
    expect(invoke).toHaveBeenCalledWith("reverse-geocode", { body: { lat: 44.1, lng: 3.1 }, signal });
  });

  it("coordonnées invalides → null, aucun appel réseau", async () => {
    for (const [la, ln] of [[NaN, 3], [0, 0], [91, 3], [44, 181]]) {
      await expect(reverseGeocode(la, ln)).resolves.toBeNull();
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("aucun résultat → null", async () => {
    invoke.mockResolvedValue({ data: { address: null }, error: null });
    await expect(reverseGeocode(44.1, 3.1)).resolves.toBeNull();
  });

  it("erreur serveur → propagée (l'appelant conserve l'adresse existante)", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("502") });
    await expect(reverseGeocode(44.1, 3.1)).rejects.toThrow("502");
  });
});
