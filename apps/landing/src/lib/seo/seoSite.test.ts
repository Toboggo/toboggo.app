import { describe, expect, it } from "vitest";
import { many, park, rich } from "./fixtures";
import { buildSeoSite, publishedPaths, sitemapExclusions } from "./seoSite";
import { groupByDepartment } from "./hub";
import { HUB_PATH } from "./places";
import { DOCUMENTED_CARDS_VISIBLE, OTHERS_VISIBLE, splitVisible } from "./display";

const snapshot = (parks: ReturnType<typeof park>[]) => ({ fetchedAt: "2026-10-02T00:00:00Z", parks });

/** Ville éligible (10 affichables dont 4 documentés) */
const goodCity = (city: string, postalCode: string, department = "Aveyron") => [
  ...many(4, () => rich({ city, postalCode, adminArea2: department })),
  ...many(6, () => park({ city, postalCode, adminArea2: department })),
];

describe("buildSeoSite — one source of truth for pages, hub, sitemap and links", () => {
  it("publishes only cities that are approved AND eligible", () => {
    const parks = [...goodCity("Millau", "12100"), ...goodCity("Rodez", "12000"), ...many(2, () => park({ city: "Albi", postalCode: "81000" }))];
    const site = buildSeoSite(snapshot(parks), { approved: ["millau", "albi"] });
    expect(site.published.map((p) => p.place.slug)).toEqual(["millau"]); // albi validée mais non éligible
    expect(site.candidates.map((p) => p.place.slug)).toEqual(["rodez"]); // éligible mais non validée : ni page ni lien
    expect(site.issues).toHaveLength(1);
    expect(site.issues[0]).toMatch(/albi.*non éligible.*page non générée/);
    expect(publishedPaths(site)).toEqual(["/aires-de-jeux/millau/"]);
  });

  it("does not open every eligible city automatically", () => {
    const parks = [...goodCity("Millau", "12100"), ...goodCity("Rodez", "12000"), ...goodCity("Cugnaux", "31270", "Haute-Garonne")];
    expect(buildSeoSite(snapshot(parks), { approved: [] }).published).toEqual([]);
    expect(buildSeoSite(snapshot(parks), { approved: ["millau"] }).published).toHaveLength(1);
  });

  it("merges city spelling variants before judging eligibility", () => {
    const parks = [
      ...many(3, () => rich({ city: "Onet-Le-Chateau", postalCode: "12850" })),
      ...many(2, () => rich({ city: "Onet-le-Château", postalCode: "12850" })),
      ...many(5, () => park({ city: "Onet-le-Château", postalCode: "12850" })),
    ];
    const site = buildSeoSite(snapshot(parks), { approved: ["onet-le-chateau"] });
    expect(site.published).toHaveLength(1);
    expect(site.published[0].place.name).toBe("Onet-le-Château");
    expect(site.published[0].listed).toHaveLength(10);
  });

  it("in strict mode an approved city that is no longer eligible fails the build (no silent 404)", () => {
    const thin = snapshot(many(8, () => park({ city: "Millau" })));
    expect(() => buildSeoSite(thin, { approved: ["millau"], strict: true })).toThrow(/millau.*non éligible/);
    expect(() => buildSeoSite(snapshot([]), { approved: ["millau"], strict: true })).toThrow(/introuvable/);
    expect(() => buildSeoSite(thin, { approved: ["millau"], strict: false })).not.toThrow();
  });

  it("splits documented cards and compact entries", () => {
    const data = buildSeoSite(snapshot(goodCity("Millau", "12100")), { approved: ["millau"] }).published[0];
    expect(data.documented).toHaveLength(4);
    expect(data.others).toHaveLength(6);
    expect(data.listed).toHaveLength(10);
  });
});

describe("hub and sitemap", () => {
  it("hub is indexable only when at least one city page exists, and is then in the sitemap", () => {
    const withCity = buildSeoSite(snapshot(goodCity("Millau", "12100")), { approved: ["millau"] });
    expect(withCity.hubIndexable).toBe(true);
    expect(sitemapExclusions(withCity, HUB_PATH)).toEqual([]);

    const empty = buildSeoSite(snapshot(goodCity("Millau", "12100")), { approved: [] });
    expect(empty.hubIndexable).toBe(false);
    expect(sitemapExclusions(empty, HUB_PATH)).toEqual([HUB_PATH]);
  });

  it("without Supabase configuration the hub is excluded from the sitemap and no city is published", () => {
    expect(sitemapExclusions(null, HUB_PATH)).toEqual([HUB_PATH]);
    expect(publishedPaths(null)).toEqual([]);
  });

  it("groups published cities by department, sorted, unknown department last", () => {
    const parks = [...goodCity("Millau", "12100", "Aveyron"), ...goodCity("Cugnaux", "31270", "Haute-Garonne"), ...goodCity("Rodez", "12000", "Aveyron"), ...many(10, () => rich({ city: "Sansdept", postalCode: "99999", adminArea2: null }))];
    const site = buildSeoSite(snapshot(parks), { approved: ["millau", "cugnaux", "rodez", "sansdept"] });
    const groups = groupByDepartment(site.published);
    expect(groups.map((g) => g.name)).toEqual(["Aveyron", "Haute-Garonne", "Autres villes"]);
    expect(groups[0].places.map((p) => p.place.name)).toEqual(["Millau", "Rodez"]);
  });
});

describe("folding long lists", () => {
  it("keeps everything but folds beyond the threshold", () => {
    const items = Array.from({ length: 40 }, (_, i) => i);
    const { shown, folded } = splitVisible(items, OTHERS_VISIBLE);
    expect(shown).toHaveLength(15);
    expect(folded).toHaveLength(25);
    expect([...shown, ...folded]).toEqual(items);
  });

  it("does not fold a short list (Millau: 8 entries)", () => {
    expect(splitVisible([1, 2, 3, 4, 5, 6, 7, 8], OTHERS_VISIBLE).folded).toEqual([]);
    expect(splitVisible(Array.from({ length: 12 }, (_, i) => i), DOCUMENTED_CARDS_VISIBLE).folded).toEqual([]);
  });
});
