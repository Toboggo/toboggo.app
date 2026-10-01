import { describe, expect, it, vi } from "vitest";
import { findSeoCity, SEO_CITIES } from "./cities";
import { evaluateEligibility, hasValidCoordinates, isDocumented, isListable, THRESHOLDS } from "./eligibility";
import { ageLabel, describePark, formatAddress, streetOf, type SeoPark } from "./parks";
import { groupByMinAge, repeatedStreets } from "./insights";
import { buildParksQuery, fetchCityParks, mapRow, readConfig } from "./supabase";
import { buildCityPageData, sitemapExclusions } from "./cityPage";
import { breadcrumbLd, parksItemListLd } from "./jsonld";

const millau = SEO_CITIES[0];

function park(overrides: Partial<SeoPark> = {}): SeoPark {
  return {
    name: "Aire de jeux",
    city: "Millau",
    postalCode: "12100",
    addressLine: "1 Rue Test",
    latitude: 44.1,
    longitude: 3.07,
    minAge: null,
    maxAge: null,
    features: {},
    ...overrides,
  };
}

const rich = (n = 0) =>
  park({
    name: `Parc ${n}`,
    minAge: 2,
    maxAge: 12,
    features: { slide: { status: "available" }, toilets: { status: "available" }, benches: { status: "available" } },
  });

describe("cities allowlist", () => {
  it("only Millau is generated", () => {
    expect(SEO_CITIES.map((c) => c.slug)).toEqual(["millau"]);
    expect(findSeoCity("toulouse")).toBeUndefined();
  });
});

describe("listing / documentation rules", () => {
  it("requires valid coordinates and a postal code", () => {
    expect(isListable(park())).toBe(true);
    expect(isListable(park({ postalCode: null }))).toBe(false);
    expect(isListable(park({ postalCode: "  " }))).toBe(false);
    expect(hasValidCoordinates(park({ latitude: null }))).toBe(false);
    expect(hasValidCoordinates(park({ latitude: 0, longitude: 0 }))).toBe(false);
    expect(hasValidCoordinates(park({ latitude: 91 }))).toBe(false);
  });

  it("documented = complete age range OR >= 3 useful declared infos", () => {
    expect(isDocumented(park())).toBe(false);
    expect(isDocumented(park({ minAge: 1 }))).toBe(false); // âge partiel
    expect(isDocumented(park({ minAge: 1, maxAge: 12 }))).toBe(true);
    const two = { slide: { status: "available" }, toilets: { status: "available" } };
    expect(isDocumented(park({ features: two }))).toBe(false);
    expect(isDocumented(park({ features: { ...two, benches: { status: "available" } } }))).toBe(true);
    // surface seule ne compte pas ; un équipement indisponible non plus
    expect(isDocumented(park({ features: { surface_type: { status: "available", value: "rubber" }, slide: { status: "unavailable" } } }))).toBe(false);
  });
});

describe("evaluateEligibility", () => {
  const five = [rich(1), rich(2), rich(3), park(), park()];

  it("passes with >= 5 listed, >= 3 documented, >= 80% addressed", () => {
    const r = evaluateEligibility(five);
    expect(r.eligible).toBe(true);
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });

  it("fails with fewer than 5 listed parks", () => {
    expect(evaluateEligibility(five.slice(0, 4)).eligible).toBe(false);
  });

  it("fails with fewer than 3 documented parks", () => {
    const r = evaluateEligibility([rich(1), rich(2), park(), park(), park()]);
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.id === "documented")?.passed).toBe(false);
  });

  it("fails when under 80% of parks have address + coordinates", () => {
    const noAddress = park({ addressLine: null });
    const r = evaluateEligibility([rich(1), rich(2), rich(3), noAddress, noAddress, noAddress]);
    expect(r.checks.find((c) => c.id === "addressed")?.passed).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it("is not eligible with no parks, and exposes the thresholds used", () => {
    expect(evaluateEligibility([]).eligible).toBe(false);
    expect(THRESHOLDS).toMatchObject({ minListedParks: 5, minDocumentedParks: 3, minAddressedRatio: 0.8 });
  });
});

describe("describePark / labels", () => {
  it("reads fence/shade by VALUE: not_fenced is never shown as fenced", () => {
    const notFenced = describePark(park({ features: { fence_status: { status: "available", value: "not_fenced" } } }));
    expect(notFenced.environment).toEqual([]);
    const fenced = describePark(park({ features: { fence_status: { status: "available", value: "fully_fenced" } } }));
    expect(fenced.environment).toEqual(["Clôturé"]);
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
    const groups = groupByMinAge([rich(1), park({ minAge: 0, maxAge: 12 }), park({ minAge: 1 })]);
    expect(groups.map((g) => g.minAge)).toEqual([0, 2]);
  });

  it("reports streets shared by at least two parks", () => {
    const a = park({ addressLine: "860 Avenue De l'Aigoual" });
    const b = park({ addressLine: "387 Avenue De l'Aigoual" });
    expect(repeatedStreets([a, b, park({ addressLine: "2 Rue Seule" })])).toEqual([{ street: "Avenue de l'Aigoual", count: 2 }]);
  });
});

describe("supabase read layer", () => {
  it("reads config only when URL and anon key are present", () => {
    expect(readConfig({})).toBeNull();
    expect(readConfig({ PUBLIC_SUPABASE_URL: "https://x.supabase.co/" })).toBeNull();
    expect(readConfig({ PUBLIC_SUPABASE_URL: "nope", PUBLIC_SUPABASE_ANON_KEY: "k" })).toBeNull();
    expect(readConfig({ PUBLIC_SUPABASE_URL: "https://x.supabase.co/", PUBLIC_SUPABASE_ANON_KEY: "k" })).toEqual({ url: "https://x.supabase.co", anonKey: "k" });
  });

  it("filters on country, city, published and active", () => {
    const q = new URLSearchParams(buildParksQuery(millau));
    expect(q.get("country_code")).toBe("eq.FR");
    expect(q.get("city")).toBe("eq.Millau");
    expect(q.get("moderation_status")).toBe("eq.published");
    expect(q.get("operational_status")).toBe("eq.active");
  });

  it("only issues GET requests and maps numeric strings", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ name: "A", city: "Millau", postal_code: "12100", address_line: "x", latitude: "44.1", longitude: 3.07, min_age: 1, max_age: 12, features: null }]), { status: 200 }));
    const parks = await fetchCityParks({ url: "https://x.supabase.co", anonKey: "k" }, millau, fetchMock as unknown as typeof fetch);
    expect(parks[0]).toMatchObject({ latitude: 44.1, longitude: 3.07, features: {} });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("GET");
  });

  it("fails loudly on an HTTP error instead of publishing an empty page", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    await expect(fetchCityParks({ url: "https://x.supabase.co", anonKey: "k" }, millau, fetchMock as unknown as typeof fetch)).rejects.toThrow(/HTTP 500/);
  });

  it("mapRow tolerates missing values", () => {
    expect(mapRow({ name: "A", city: null, postal_code: null, address_line: null, latitude: null, longitude: "abc", min_age: null, max_age: null, features: null })).toMatchObject({ latitude: null, longitude: null });
  });
});

describe("sitemap exclusions", () => {
  const eligible = buildCityPageData(millau, [rich(1), rich(2), rich(3), park(), park()]);
  const ineligible = buildCityPageData(millau, [rich(1)]);

  it("lists an eligible city and the hub", () => {
    expect(sitemapExclusions([eligible])).toEqual([]);
  });

  it("excludes an ineligible city and the hub when nothing is eligible", () => {
    expect(sitemapExclusions([ineligible])).toEqual(["/aires-de-jeux/millau/", "/aires-de-jeux/"]);
  });

  it("excludes everything without Supabase configuration", () => {
    expect(sitemapExclusions(null)).toEqual(["/aires-de-jeux/", "/aires-de-jeux/millau/"]);
  });
});

describe("json-ld", () => {
  it("builds breadcrumbs with absolute URLs", () => {
    const ld = breadcrumbLd([{ name: "Accueil", path: "/" }, { name: "Aires de jeux", path: "/aires-de-jeux/" }]) as { itemListElement: { item: string; position: number }[] };
    expect(ld.itemListElement.map((i) => i.item)).toEqual(["https://toboggo-website.vercel.app/", "https://toboggo-website.vercel.app/aires-de-jeux/"]);
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2]);
  });

  it("describes playgrounds with only available properties (no rating, image, url)", () => {
    const ld = parksItemListLd([rich(1)], "FR");
    const json = JSON.stringify(ld);
    expect(json).toContain('"@type":"Playground"');
    expect(json).toContain('"GeoCoordinates"');
    expect(json).not.toMatch(/aggregateRating|image|telephone|openingHours|LocalBusiness/);
  });
});

import { HOME_MAX_CARDS, pickHomeCards, toCard } from "./homeParks";
import { iconsFor } from "./parks";

describe("home cards", () => {
  it("never carries an image and shows only declared info", () => {
    const card = toCard(rich(1));
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
    const many = Array.from({ length: 8 }, (_, i) => rich(i));
    const data = buildCityPageData(millau, [poor, ...many]);
    const cards = pickHomeCards(data);
    expect(cards).toHaveLength(HOME_MAX_CARDS);
    expect(cards.map((c) => c.name)).not.toContain("Zeta");
  });
});
