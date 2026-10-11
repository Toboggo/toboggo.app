import { describe, expect, it } from "vitest";
import { park, rich, uuid } from "./fixtures";
import { APPROVED_PARKS, validateApprovedParks, type ApprovedPark } from "./approvedParks";
import { analyzePlace, buildSeoSite, sitemapExclusions } from "./seoSite";
import { groupPlaces, HUB_PATH } from "./places";
import { evaluateParkPage, indexability, buildParkPages, PARK_PAGE_THRESHOLDS } from "./parkPages";
import { parkTier } from "./tiers";
import { assignSlugs } from "./slugs";
import { parkDescription, parkTitle, buildParkContent, criteriaOf, formatDistance } from "./parkContent";
import { parkPageLd, parksItemListLd } from "./jsonld";
import type { SeoPark } from "./parks";

const A = (n: number) => uuid(1000 + n);

/** Parc riche, avec nom spécifique (≥ 5 infos, ≥ 2 groupes). */
const fiche = (n: number, over: Partial<SeoPark> = {}) =>
  rich({
    id: A(n),
    name: `Parc Test ${n}`,
    latitude: 44.1 + n / 1000,
    longitude: 3.07,
    features: {
      slide: { status: "available" },
      swing: { status: "available" },
      toilets: { status: "available" },
      benches: { status: "available" },
      wheelchair_access: { status: "available" },
      fence_status: { status: "available", value: "fully_fenced" },
    },
    ...over,
  });

const entry = (n: number, over: Partial<ApprovedPark> = {}): ApprovedPark => ({ placeSlug: "millau", parkId: A(n), slug: `parc-test-${n}`, editorialReview: null, ...over });

/** Complète les parcs testés pour que la ville fictive soit ÉLIGIBLE (≥ 5 affichables, ≥ 3 documentés, ≥ 20 %). */
const padding = () => [...Array.from({ length: 3 }, () => rich({ name: "Aire de jeux" })), ...Array.from({ length: 6 }, () => park())];

function publishedMillau(parks: SeoPark[]) {
  const site = buildSeoSite({ fetchedAt: "t", parks: [...parks, ...padding()] }, { approved: ["millau"], approvedParks: [] });
  return site.published;
}

describe("allowlist des fiches (APPROVED_PARKS)", () => {
  it("contains exactly the 6 Millau parks and nothing else", () => {
    expect(APPROVED_PARKS).toHaveLength(6);
    expect(new Set(APPROVED_PARKS.map((p) => p.placeSlug))).toEqual(new Set(["millau"]));
    expect(APPROVED_PARKS.map((p) => p.slug).sort()).toEqual([
      "aire-de-jeux-de-gourg-de-bade",
      "aire-de-jeux-de-viastels",
      "aire-de-jeux-du-quai-sully-chalies",
      "parc-de-la-mairie",
      "parc-de-la-victoire-bas",
      "parc-de-la-victoire-haut",
    ]);
  });

  it("has unique ids and slugs and well-formed slugs", () => {
    expect(validateApprovedParks(APPROVED_PARKS)).toEqual([]);
  });

  it("no fiche is reviewed (indexation closed) until a human fills editorialReview", () => {
    expect(APPROVED_PARKS.every((p) => p.editorialReview === null)).toBe(true);
  });

  it("detects duplicates and bad slugs", () => {
    const dup = [entry(1), entry(1, { slug: "autre" }), entry(2, { slug: "parc-test-1" }), entry(3, { slug: "Mauvais Slug" })];
    const problems = validateApprovedParks(dup).join(" | ");
    expect(problems).toMatch(/parc en double/);
    expect(problems).toMatch(/slug en double dans la ville/);
    expect(problems).toMatch(/slug invalide/);
  });

  it("rejects a malformed review date", () => {
    expect(validateApprovedParks([entry(1, { editorialReview: { reviewedAt: "hier", reviewer: "x" } })])[0]).toMatch(/date de relecture invalide/);
  });
});

describe("slugs — deterministic and collision-safe", () => {
  const names = ["Parc de la Mairie", "Parc de la Victoire - Haut", "Parc de la Victoire - Bas", "Aire de jeux du Quai Sully-Chalies", "Aire de jeux de Gourg de bade", "Aire de jeux de Viastels"];
  const parks = names.map((name, i) => park({ id: uuid(i + 1), name, addressLine: null }));

  it("the frozen slugs equal what the slug rules give for the current Millau names", () => {
    const generated = [...assignSlugs(parks).values()].sort();
    expect(generated).toEqual(APPROVED_PARKS.map((p) => p.slug).sort());
  });

  it("is deterministic whatever the input order", () => {
    expect([...assignSlugs(parks).entries()].sort()).toEqual([...assignSlugs([...parks].reverse()).entries()].sort());
  });

  it("a homonym never steals a frozen URL: collisions get a distinct slug, generated pages keep the frozen one", () => {
    const twin = park({ id: uuid(99), name: "Parc de la Mairie", addressLine: null });
    const slugs = assignSlugs([...parks, twin]);
    expect(new Set(slugs.values()).size).toBe(7);
    // le slug figé reste celui de l'allowlist, quoi que donne le générateur
    const pages = buildParkPages(publishedMillau([fiche(1, { name: "Parc de la Mairie" }), fiche(2, { name: "Parc de la Mairie" })]), [entry(1, { slug: "parc-de-la-mairie" }), entry(2, { slug: "parc-de-la-mairie-2" })]);
    expect(pages.pages.map((p) => p.path)).toEqual(["/aires-de-jeux/millau/parc-de-la-mairie/", "/aires-de-jeux/millau/parc-de-la-mairie-2/"]);
    expect(pages.pages.map((p) => p.slug)).toEqual(["parc-de-la-mairie", "parc-de-la-mairie-2"]);
  });

  it("warns (without changing the URL) when a frozen slug no longer matches the park name", () => {
    const { pages, issues } = buildParkPages(publishedMillau([fiche(1, { name: "Nom Changé" })]), [entry(1)]);
    expect(pages[0].slug).toBe("parc-test-1");
    expect(issues.some((i) => i.severity === "warning" && /slug figé diffère/.test(i.message))).toBe(true);
  });
});

describe("seuil de qualité d'une fiche", () => {
  it("thresholds are the proposed ones", () => {
    expect(PARK_PAGE_THRESHOLDS).toEqual({ minDeclared: 5, minGroups: 2 });
  });

  it("a rich, specific, located park passes", () => {
    expect(evaluateParkPage(fiche(1)).eligible).toBe(true);
  });

  it("fails on a generic name", () => {
    const r = evaluateParkPage(fiche(1, { name: "Aire de jeux" }));
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.id === "specificName")?.passed).toBe(false);
  });

  it("fails below 5 declared infos", () => {
    const thin = fiche(1, { features: { slide: { status: "available" }, toilets: { status: "available" }, benches: { status: "available" }, swing: { status: "available" } } });
    const r = evaluateParkPage(thin);
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.id === "declared")?.passed).toBe(false);
  });

  it("fails when all infos sit in a single group (one-dimensional page)", () => {
    const oneGroup = fiche(1, { features: { slide: { status: "available" }, swing: { status: "available" }, climbing: { status: "available" }, sandbox: { status: "available" }, springer: { status: "available" } } });
    const r = evaluateParkPage(oneGroup);
    expect(r.checks.find((c) => c.id === "groups")?.passed).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it("fails without coordinates, city or postal code", () => {
    expect(evaluateParkPage(fiche(1, { latitude: null })).eligible).toBe(false);
    expect(evaluateParkPage(fiche(1, { postalCode: null })).eligible).toBe(false);
    expect(evaluateParkPage(fiche(1, { city: null })).eligible).toBe(false);
  });

  it("does not require an address (Viastels / Victoire - Bas have none)", () => {
    expect(evaluateParkPage(fiche(1, { addressLine: null })).eligible).toBe(true);
  });
});

describe("génération : aucun parc pauvre, aucune ville ni fiche non validée", () => {
  it("only approved parks are generated — the other Millau parks and eligible parks never are", () => {
    const parks = [fiche(1), fiche(2), fiche(3)]; // 3 parcs éligibles
    const pub = publishedMillau(parks);
    const { pages } = buildParkPages(pub, [entry(1)]);
    expect(pages.map((p) => p.park.id)).toEqual([A(1)]);
  });

  it("an approved but poor park is NOT generated (and reported)", () => {
    const poor = fiche(1, { name: "Aire de jeux" });
    const { pages, issues } = buildParkPages(publishedMillau([poor]), [entry(1)]);
    expect(pages).toEqual([]);
    expect(issues[0].message).toMatch(/non générée : seuil de qualité/);
  });

  it("an approved park whose city is not published is not generated", () => {
    const site = buildSeoSite({ fetchedAt: "t", parks: [fiche(1)] }, { approved: [], approvedParks: [entry(1)] });
    expect(site.parkPages).toEqual([]);
    expect(site.parkIssues[0]).toMatch(/n'est pas publiée/);
  });

  it("a missing approved park is reported, not invented", () => {
    const { pages, issues } = buildParkPages(publishedMillau([]), [entry(7)]);
    expect(pages).toEqual([]);
    expect(issues[0].message).toMatch(/introuvable/);
  });

  it("strict mode fails only for a fiche that was editorially reviewed (index intended)", () => {
    const reviewed = entry(1, { editorialReview: { reviewedAt: "2026-10-10", reviewer: "Test" } });
    expect(() => buildParkPages(publishedMillau([]), [reviewed], { strict: true })).toThrow(/introuvable/);
    expect(() => buildParkPages(publishedMillau([]), [entry(1)], { strict: true })).not.toThrow();
  });

  it("an invalid allowlist always fails the build", () => {
    expect(() => buildParkPages(publishedMillau([fiche(1)]), [entry(1), entry(1)])).toThrow(/liste des fiches invalide/);
  });

  it("the real allowlist generates nothing on data that does not contain those parks", () => {
    const site = buildSeoSite({ fetchedAt: "t", parks: [fiche(1), fiche(2), fiche(3), fiche(4), fiche(5)] }, { approved: ["millau"] });
    expect(site.parkPages).toEqual([]);
  });
});

describe("indexation et sitemap", () => {
  const unreviewed = entry(1);
  const reviewed = entry(2, { editorialReview: { reviewedAt: "2026-10-10", reviewer: "Test" } });

  it("tier 2 without signal and without review → noindex", () => {
    expect(indexability(parkTier(fiche(1)), unreviewed)).toEqual({ indexable: false, via: null });
  });

  it("an explicit editorial review makes a documented fiche indexable", () => {
    expect(indexability(parkTier(fiche(2)), reviewed)).toEqual({ indexable: true, via: "editorial" });
  });

  it("a real quality signal (tier 3) makes it indexable without review", () => {
    const p = fiche(1, { collectivityVerified: true });
    expect(parkTier(p).tier).toBe(3);
    expect(indexability(parkTier(p), unreviewed)).toEqual({ indexable: true, via: "tier3" });
  });

  it("a review never makes a poor (tier < 2) park indexable", () => {
    const poor = park({ id: A(3) });
    expect(indexability(parkTier(poor), reviewed).indexable).toBe(false);
  });

  it("sitemap excludes noindex fiches and keeps indexable ones", () => {
    const parks = [fiche(1), fiche(2)];
    const site = buildSeoSite({ fetchedAt: "t", parks: [...parks, ...padding()] }, { approved: ["millau"], approvedParks: [unreviewed, reviewed] });
    expect(site.parkPages.map((p) => [p.slug, p.indexable])).toEqual([["parc-test-1", false], ["parc-test-2", true]]);
    expect(sitemapExclusions(site, HUB_PATH)).toEqual(["/aires-de-jeux/millau/parc-test-1/"]);
  });
});

describe("contenu — uniquement des faits", () => {
  it("never presents an unrecorded feature as absent: it is « Non renseigné » and to be confirmed", () => {
    const p = fiche(1, { features: { slide: { status: "available" }, toilets: { status: "unavailable" } } });
    const c = criteriaOf(p);
    expect(c.find((x) => x.key === "toilets")).toMatchObject({ state: "no", text: "Non" });
    expect(c.find((x) => x.key === "water")).toMatchObject({ state: "unknown", text: "Non renseigné" });
    expect(buildParkContent(p).toConfirm).toContain("Point d'eau potable : à confirmer");
    expect(buildParkContent(p).unavailable).toEqual(["Toilettes"]);
  });

  it("reads fence and shade by value (not_fenced is « Non clôturé », never « Clôturé »)", () => {
    const c = criteriaOf(fiche(1, { features: { fence_status: { status: "available", value: "not_fenced" }, shade_level: { status: "available", value: "partial" } } }));
    expect(c.find((x) => x.key === "fence")).toMatchObject({ state: "no", text: "Non clôturé" });
    expect(c.find((x) => x.key === "shade")).toMatchObject({ state: "partial", text: "Ombre partielle" });
  });

  it("address only when it really exists; coordinates link to OpenStreetMap", () => {
    expect(buildParkContent(fiche(1, { addressLine: null })).address).toBeNull();
    expect(buildParkContent(fiche(1, { addressLine: null })).toConfirm).toContain("Adresse : non renseignée");
    const c = buildParkContent(fiche(1, { addressLine: "2 Rue De La Pépinière" }));
    expect(c.address).toBe("2 Rue de la Pépinière");
    expect(c.coordinates?.osmUrl).toMatch(/^https:\/\/www\.openstreetmap\.org\/\?mlat=44\.101&mlon=3\.07#map=18\/44\.101\/3\.07$/);
  });

  it("has no rating, review or photo field at all", () => {
    const keys = Object.keys(buildParkContent(fiche(1))).join(",");
    expect(keys).not.toMatch(/rating|review|avis|photo|image/i);
  });

  it("title and description are unique per park and within length limits", () => {
    const parks = [fiche(1, { name: "Parc de la Mairie" }), fiche(2, { name: "Parc de la Victoire - Haut", minAge: 0 }), fiche(3, { name: "Aire de jeux du Quai Sully-Chalies", maxAge: 9 })];
    const descs = parks.map((p) => parkDescription(p, buildParkContent(p), "Millau"));
    const titles = parks.map((p) => parkTitle(p, "Millau"));
    expect(new Set(descs).size).toBe(3);
    expect(new Set(titles).size).toBe(3);
    for (const d of descs) expect(d.length).toBeLessThanOrEqual(158);
    for (const t of titles) expect(t.length + " — Toboggo".length).toBeLessThanOrEqual(65);
    expect(descs[0]).toMatch(/^Parc de la Mairie à Millau \(12100\) : aire de jeux pour les enfants de 2 à 12 ans avec toboggan/);
    expect(descs[2]).toMatch(/^Aire de jeux du Quai Sully-Chalies à Millau \(12100\), pour les enfants de 2 à 9 ans, avec/);
  });

  it("formats real distances", () => {
    expect(formatDistance(630)).toBe("630 m");
    expect(formatDistance(1249)).toBe("1,2 km");
  });
});

describe("JSON-LD d'une fiche", () => {
  const p = fiche(1, { addressLine: "2 Rue De La Pépinière" });

  it("is a Playground with only available properties", () => {
    const ld = parkPageLd(p, "FR", "/aires-de-jeux/millau/parc-test-1/", "Millau") as Record<string, any>;
    expect(ld["@type"]).toBe("Playground");
    expect(ld.name).toBe("Parc Test 1");
    expect(ld.url).toBe("https://toboggo-website.vercel.app/aires-de-jeux/millau/parc-test-1/");
    expect(ld.address).toMatchObject({ streetAddress: "2 Rue de la Pépinière", postalCode: "12100", addressLocality: "Millau", addressCountry: "FR" });
    expect(ld.geo).toMatchObject({ "@type": "GeoCoordinates", latitude: 44.101, longitude: 3.07 });
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review|image|photo|telephone|openingHours|priceRange|LocalBusiness/);
  });

  it("omits streetAddress when there is no address (nothing invented)", () => {
    const ld = parkPageLd(fiche(1, { addressLine: null }), "FR", "/x/", "Millau") as Record<string, any>;
    expect(ld.address.streetAddress).toBeUndefined();
    expect(ld.address.postalCode).toBe("12100");
  });

  it("the city ItemList only carries URLs of INDEXABLE fiches", () => {
    const list = parksItemListLd([p, fiche(2)], "FR", (park) => (park.id === p.id ? "/aires-de-jeux/millau/parc-test-1/" : undefined)) as any;
    expect(list.itemListElement[0].item.url).toBe("https://toboggo-website.vercel.app/aires-de-jeux/millau/parc-test-1/");
    expect(list.itemListElement[1].item.url).toBeUndefined();
  });
});

describe("nearby", () => {
  it("lists only generated fiches of the same city, nearest first, at most 3", () => {
    const parks = [1, 2, 3, 4, 5].map((n) => fiche(n));
    const entries = [1, 2, 3, 4, 5].map((n) => entry(n));
    const { pages } = buildParkPages(publishedMillau(parks), entries);
    const first = pages[0];
    expect(first.nearby).toHaveLength(3);
    expect(first.nearby.map((n) => n.name)).toEqual(["Parc Test 2", "Parc Test 3", "Parc Test 4"]);
    expect(first.nearby.every((n) => n.path.startsWith("/aires-de-jeux/millau/"))).toBe(true);
    expect(first.nearby.map((n) => n.distanceM)).toEqual([...first.nearby.map((n) => n.distanceM)].sort((a, b) => a - b));
  });
});

describe("analyzePlace wiring", () => {
  it("park pages come from the same place data as the city page", () => {
    const place = groupPlaces([fiche(1), ...Array.from({ length: 6 }, () => park())])[0];
    expect(analyzePlace(place).documented.map((p) => p.id)).toContain(A(1));
  });
});
