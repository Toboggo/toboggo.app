import { describe, expect, it } from "vitest";
import { parkEditTypeLabel, parkEditItems, formatItemValue } from "./parkEditType";

function changesWithFields(...fields: string[]) {
  return { items: fields.map((field) => ({ field, label: field, current: null, proposed: null })) };
}

describe("parkEditTypeLabel", () => {
  it("classe 'ages' comme Âges", () => {
    expect(parkEditTypeLabel(changesWithFields("ages"))).toBe("Âges");
  });

  it("classe 'location' comme Localisation", () => {
    expect(parkEditTypeLabel(changesWithFields("location"))).toBe("Localisation");
  });

  it("classe tout 'feature:<code>' comme Équipements", () => {
    expect(parkEditTypeLabel(changesWithFields("feature:slide"))).toBe("Équipements");
    expect(parkEditTypeLabel(changesWithFields("feature:swing"))).toBe("Équipements");
  });

  it("classe 'free_text' et tout field inconnu comme Autre", () => {
    expect(parkEditTypeLabel(changesWithFields("free_text"))).toBe("Autre");
    expect(parkEditTypeLabel(changesWithFields("mystery"))).toBe("Autre");
  });

  it("classe une proposition multi-catégories comme 'Plusieurs modifications'", () => {
    expect(parkEditTypeLabel(changesWithFields("ages", "location"))).toBe("Plusieurs modifications");
    expect(parkEditTypeLabel(changesWithFields("ages", "feature:slide"))).toBe("Plusieurs modifications");
  });

  it("ne classe PAS 'Plusieurs modifications' si tous les items sont de la même catégorie réelle", () => {
    expect(parkEditTypeLabel(changesWithFields("feature:slide", "feature:swing"))).toBe("Équipements");
    expect(parkEditTypeLabel(changesWithFields("ages", "ages"))).toBe("Âges");
  });

  it("la décision dépend du nombre de catégories DISTINCTES, pas du nombre d'items", () => {
    // 2 items, 1 seule catégorie réelle -> cette catégorie, pas "Plusieurs modifications".
    expect(parkEditTypeLabel(changesWithFields("feature:slide", "feature:swing"))).toBe("Équipements");
    // 2 items, 2 catégories distinctes (dont une qui retombe sur "Autre") -> "Plusieurs modifications".
    expect(parkEditTypeLabel(changesWithFields("location", "free_text"))).toBe("Plusieurs modifications");
  });

  it("retombe sur Autre pour changes malformé/vide", () => {
    expect(parkEditTypeLabel(null)).toBe("Autre");
    expect(parkEditTypeLabel({})).toBe("Autre");
    expect(parkEditTypeLabel({ items: [] })).toBe("Autre");
  });
});

describe("parkEditItems", () => {
  it("extrait field/label/current/proposed sans planter sur une forme inattendue", () => {
    const items = parkEditItems({
      items: [
        { field: "ages", label: "Tranche d'âge", current: { min: 3, max: 10 }, proposed: { min: 4, max: 11 } },
        "not-an-object",
        { label: "sans field" },
        { field: "location", current: { latitude: 43.6, longitude: 1.44 }, proposed: { lat: 44, lng: 2 } },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      field: "ages",
      label: "Tranche d'âge",
      current: { min: 3, max: 10 },
      proposed: { min: 4, max: 11 },
    });
    expect(items[1].field).toBe("location");
  });
});

describe("formatItemValue", () => {
  it("formate un scalaire, un objet et une valeur absente", () => {
    expect(formatItemValue("available")).toBe("available");
    expect(formatItemValue(4)).toBe("4");
    expect(formatItemValue(null)).toBe("—");
    expect(formatItemValue(undefined)).toBe("—");
    expect(formatItemValue({ min: 3, max: 10 })).toBe("min : 3 · max : 10");
  });
});
