import { describe, expect, it } from "vitest";
import type { Park } from "@toboggo/shared";
import type { ParkEditItem } from "./parkEditType";
import { previewParkEditItem } from "./parkEditReviewPreview";

/** Un `Park` minimal — seuls `min_age`/`max_age`/`latitude`/`longitude`/
 * `features` sont lus par `previewParkEditItem`, le reste est un remplissage
 * neutre pour satisfaire le type. */
function makePark(overrides: Partial<Park>): Park {
  return {
    min_age: null,
    max_age: null,
    latitude: 0,
    longitude: 0,
    features: {},
    ...overrides,
  } as Park;
}

function item(overrides: Partial<ParkEditItem>): ParkEditItem {
  return { field: "ages", label: "Tranche d'âge", current: undefined, proposed: undefined, ...overrides };
}

describe("previewParkEditItem — ages", () => {
  it("ALREADY_APPLIED quand le parc a déjà la valeur proposée (B == C)", () => {
    const park = makePark({ min_age: 4, max_age: 11 });
    const result = previewParkEditItem(
      item({ field: "ages", current: { min: 3, max: 10 }, proposed: { min: 4, max: 11 } }),
      park,
    );
    expect(result.result).toBe("ALREADY_APPLIED");
    expect(result.live).toEqual({ min: 4, max: 11 });
  });

  it("APPLICABLE quand le parc a toujours la valeur soumise (B == A != C)", () => {
    const park = makePark({ min_age: 3, max_age: 10 });
    const result = previewParkEditItem(
      item({ field: "ages", current: { min: 3, max: 10 }, proposed: { min: 4, max: 11 } }),
      park,
    );
    expect(result.result).toBe("APPLICABLE");
  });

  it("CONFLICT quand le parc a une 3e valeur, ni A ni C", () => {
    const park = makePark({ min_age: 5, max_age: 12 });
    const result = previewParkEditItem(
      item({ field: "ages", current: { min: 3, max: 10 }, proposed: { min: 4, max: 11 } }),
      park,
    );
    expect(result.result).toBe("CONFLICT");
  });
});

describe("previewParkEditItem — location (normalisation current={latitude,longitude} / proposed={lat,lng})", () => {
  it("ALREADY_APPLIED avec tolérance flottante 1e-6", () => {
    const park = makePark({ latitude: 44.0000001, longitude: 2.0000001 });
    const result = previewParkEditItem(
      item({
        field: "location",
        current: { latitude: 43.6, longitude: 1.44 },
        proposed: { lat: 44, lng: 2 },
      }),
      park,
    );
    expect(result.result).toBe("ALREADY_APPLIED");
  });

  it("APPLICABLE quand le parc est toujours à la position soumise", () => {
    const park = makePark({ latitude: 43.6, longitude: 1.44 });
    const result = previewParkEditItem(
      item({
        field: "location",
        current: { latitude: 43.6, longitude: 1.44 },
        proposed: { lat: 44, lng: 2 },
      }),
      park,
    );
    expect(result.result).toBe("APPLICABLE");
  });

  it("CONFLICT quand le parc a bougé ailleurs depuis la soumission", () => {
    const park = makePark({ latitude: 48.85, longitude: 2.35 });
    const result = previewParkEditItem(
      item({
        field: "location",
        current: { latitude: 43.6, longitude: 1.44 },
        proposed: { lat: 44, lng: 2 },
      }),
      park,
    );
    expect(result.result).toBe("CONFLICT");
  });
});

describe("previewParkEditItem — feature:<code>", () => {
  it("ALREADY_APPLIED quand le statut réel du parc est déjà celui proposé", () => {
    const park = makePark({ features: { slide: { status: "available", value: null, quantity: null, category: "play", verified_at: null } } });
    const result = previewParkEditItem(item({ field: "feature:slide", current: "unavailable", proposed: "available" }), park);
    expect(result.result).toBe("ALREADY_APPLIED");
    expect(result.live).toBe("available");
  });

  it("APPLICABLE quand le statut réel correspond encore au 'current' soumis", () => {
    const park = makePark({ features: { slide: { status: "unavailable", value: null, quantity: null, category: "play", verified_at: null } } });
    const result = previewParkEditItem(item({ field: "feature:slide", current: "unavailable", proposed: "available" }), park);
    expect(result.result).toBe("APPLICABLE");
  });

  it("CONFLICT quand le statut réel a divergé vers autre chose", () => {
    const park = makePark({ features: { slide: { status: "temporarily_unavailable", value: null, quantity: null, category: "play", verified_at: null } } });
    const result = previewParkEditItem(item({ field: "feature:slide", current: "unavailable", proposed: "available" }), park);
    expect(result.result).toBe("CONFLICT");
  });

  it("absence de ligne park_features = 'unknown' implicite", () => {
    const park = makePark({ features: {} });
    const result = previewParkEditItem(item({ field: "feature:swing", current: "unknown", proposed: "available" }), park);
    expect(result.result).toBe("APPLICABLE");
    expect(result.live).toBe("unknown");
  });
});

describe("previewParkEditItem — free_text / field inconnu", () => {
  it("NOT_AUTOMATICALLY_APPLICABLE sans jamais relire le parc", () => {
    const park = makePark({});
    expect(previewParkEditItem(item({ field: "free_text", current: "ancien texte", proposed: "nouveau texte" }), park)).toEqual({
      result: "NOT_AUTOMATICALLY_APPLICABLE",
      live: undefined,
    });
    expect(previewParkEditItem(item({ field: "mystery" }), park).result).toBe("NOT_AUTOMATICALLY_APPLICABLE");
  });
});
