import { describe, expect, it } from "vitest";
import { park, rich } from "./fixtures";
import { ageLabel, describePark, formatAddress, iconsFor, streetOf } from "./parks";
import { groupByMinAge, repeatedStreets } from "./insights";
import { breadcrumbLd, parksItemListLd } from "./jsonld";
import { HOME_MAX_CARDS, pickHomeCards, toCard } from "./homeParks";
import { analyzePlace } from "./seoSite";
import { groupPlaces } from "./places";

describe("describePark / labels", () => {
  it("reads fence/shade by VALUE: not_fenced is never shown as fenced", () => {
    expect(describePark(park({ features: { fence_status: { status: "available", value: "not_fenced" } } })).environment).toEqual([]);
    expect(describePark(park({ features: { fence_status: { status: "available", value: "fully_fenced" } } })).environment).toEqual(["Clôturé"]);
    const partial = describePark(park({ features: { shade_level: { status: "available", value: "partial" }, fence_status: { status: "available", value: "partially_fenced" } } }));
    expect(partial.environment).toEqual(["Partiellement clôturé", "Ombre partielle"]);
  });

  it("ignores unavailable / unknown features and unlabeled codes", () => {
    const d = describePark(park({ features: { slide: { status: "unavailable" }, swing: { status: "unknown" }, mystery_code: { status: "available" }, toilets: { status: "available" } } }));
    expect(d.equipment).toEqual([]);
    expect(d.services).toEqual(["Toilettes"]);
  });

  it("groups accessibility separately and exposes the surface", () => {
    const d = describePark(park({ features: { wheelchair_access: { status: "available" }, stroller_access: { status: "available" }, surface_type: { status: "available", value: "rubber" } } }));
    expect(d.accessibility).toEqual(["Accès fauteuil roulant", "Accès poussettes"]);
    expect(d.surface).toBe("Sol souple");
    expect(d.declaredCount).toBe(2);
  });
});

describe("age and address formatting", () => {
  it("never invents an age", () => {
    expect(ageLabel({ minAge: 2, maxAge: 12 })).toBe("De 2 à 12 ans");
    expect(ageLabel({ minAge: 1, maxAge: null })).toBe("Dès 1 an");
    expect(ageLabel({ minAge: 0, maxAge: null })).toBe("Dès 0 an");
    expect(ageLabel({ minAge: null, maxAge: null })).toBeNull();
  });

  it("normalises particles and strips a duplicated postal suffix, without changing words", () => {
    expect(formatAddress(park({ addressLine: "1369 Avenue De Millau-Plage" }))).toBe("1369 Avenue de Millau-Plage");
    expect(formatAddress(park({ addressLine: "860 Avenue De l'Aigoual" }))).toBe("860 Avenue de l'Aigoual");
    expect(formatAddress(park({ addressLine: "Boulevard Pierre Bousquet, 12100 Millau" }))).toBe("Boulevard Pierre Bousquet");
    expect(formatAddress(park({ addressLine: "Lou Jassou" }))).toBe("Lou Jassou");
    expect(formatAddress(park({ addressLine: null }))).toBeNull();
  });

  it("extracts a street only from real street-like addresses", () => {
    expect(streetOf("860 Avenue de l'Aigoual")).toBe("Avenue de l'Aigoual");
    expect(streetOf("Lou Jassou")).toBeNull();
  });
});

describe("insights", () => {
  it("groups by min age and only counts complete ranges", () => {
    expect(groupByMinAge([rich(), park({ minAge: 0, maxAge: 12 }), park({ minAge: 1 })]).map((g) => g.minAge)).toEqual([0, 2]);
  });

  it("reports streets shared by at least two parks", () => {
    const a = park({ addressLine: "860 Avenue De l'Aigoual" });
    const b = park({ addressLine: "387 Avenue De l'Aigoual" });
    expect(repeatedStreets([a, b, park({ addressLine: "2 Rue Seule" })])).toEqual([{ street: "Avenue de l'Aigoual", count: 2 }]);
  });
});

describe("json-ld", () => {
  it("builds breadcrumbs with absolute URLs", () => {
    const ld = breadcrumbLd([{ name: "Accueil", path: "/" }, { name: "Aires de jeux", path: "/aires-de-jeux/" }]) as { itemListElement: { item: string; position: number }[] };
    expect(ld.itemListElement.map((i) => i.item)).toEqual(["https://toboggo-website.vercel.app/", "https://toboggo-website.vercel.app/aires-de-jeux/"]);
  });

  it("describes playgrounds with only available properties (no rating, image, url)", () => {
    const json = JSON.stringify(parksItemListLd([rich()], "FR"));
    expect(json).toContain('"@type":"Playground"');
    expect(json).toContain('"GeoCoordinates"');
    expect(json).not.toMatch(/aggregateRating|image|telephone|openingHours|LocalBusiness/);
  });
});

describe("home cards", () => {
  it("never carries an image and shows only declared info", () => {
    const card = toCard(rich());
    expect(card).not.toHaveProperty("image");
    expect(card.ageLabel).toBe("De 2 à 12 ans");
    expect(card.features).toEqual(["Toboggan", "Toilettes", "Bancs"]);
    expect(card.icons).toEqual(["ic-slide", "ic-toilets", "ic-bench"]);
  });

  it("shows fence/shade icons only when the value establishes them", () => {
    expect(iconsFor(park({ features: { fence_status: { status: "available", value: "not_fenced" } } }))).toEqual([]);
    expect(iconsFor(park({ features: { fence_status: { status: "available", value: "fully_fenced" }, shade_level: { status: "available", value: "partial" } } }))).toEqual(["ic-fence", "ic-shade"]);
  });

  it("picks the best documented parks first and caps the list", () => {
    const poor = park({ name: "Zeta", minAge: 2, maxAge: 12 });
    const many = Array.from({ length: 8 }, (_, i) => rich({ name: `Parc ${i}` }));
    const data = analyzePlace(groupPlaces([poor, ...many])[0]);
    const cards = pickHomeCards(data);
    expect(cards).toHaveLength(HOME_MAX_CARDS);
    expect(cards.map((c) => c.name)).not.toContain("Zeta");
  });
});
