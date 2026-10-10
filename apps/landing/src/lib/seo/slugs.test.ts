import { describe, expect, it } from "vitest";
import { many, park, uuid } from "./fixtures";
import { assignSlugs, isGenericName, planSlugHistory, slugCandidates, slugify } from "./slugs";

const p = (n: number, overrides = {}) => park({ id: uuid(n), ...overrides });

describe("slugify", () => {
  it("strips accents, punctuation and case", () => {
    expect(slugify("Parc de la Victoire - Haut")).toBe("parc-de-la-victoire-haut");
    expect(slugify("Aire de jeux du Quai Sully-Chalies")).toBe("aire-de-jeux-du-quai-sully-chalies");
    expect(slugify("Château d’Eau & Jeux")).toBe("chateau-d-eau-et-jeux");
    expect(slugify("  --Éléphant--  ")).toBe("elephant");
  });

  it("caps the length on a word boundary", () => {
    const slug = slugify(Array.from({ length: 30 }, () => "mot").join(" "));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("generic names", () => {
  it("detects generic names regardless of case and accents", () => {
    for (const n of ["Aire de jeux", "Aire de Jeux", "aire  de jeux", "Jeux pour enfants", "Terrain de jeux"]) expect(isGenericName(n)).toBe(true);
    for (const n of ["Parc de la Mairie", "Aire de jeux du Quai Sully-Chalies", "La Naspe"]) expect(isGenericName(n)).toBe(false);
  });
});

describe("slugCandidates", () => {
  it("specific name: name, then name + address", () => {
    expect(slugCandidates(p(1, { name: "Parc de la Mairie", addressLine: "2 Rue De La Pépinière" }))).toEqual(["parc-de-la-mairie", "parc-de-la-mairie-2-rue-de-la-pepiniere"]);
  });

  it("generic name: always built from the address; none without address (id suffix used)", () => {
    expect(slugCandidates(p(1, { addressLine: "860 Avenue De l'Aigoual" }))).toEqual(["aire-de-jeux-860-avenue-de-l-aigoual"]);
    expect(slugCandidates(p(1, { addressLine: null }))).toEqual([]);
  });
});

describe("assignSlugs — uniqueness per city", () => {
  it("keeps a unique specific name as is", () => {
    expect(assignSlugs([p(1, { name: "Parc de la Mairie" })]).get(uuid(1))).toBe("parc-de-la-mairie");
  });

  it("disambiguates same specific name with the address, then the id", () => {
    const parks = [p(1, { name: "Parc des Tilleuls", addressLine: "1 Rue A" }), p(2, { name: "Parc des Tilleuls", addressLine: "2 Rue B" }), p(3, { name: "Parc des Tilleuls", addressLine: "2 Rue B" })];
    const slugs = assignSlugs(parks);
    expect(slugs.get(uuid(1))).toBe("parc-des-tilleuls");
    expect(slugs.get(uuid(2))).toBe("parc-des-tilleuls-2-rue-b");
    expect(slugs.get(uuid(3))).toMatch(/^parc-des-tilleuls-2-rue-b-[0-9a-f]{6}$/);
    expect(new Set(slugs.values()).size).toBe(3);
  });

  it("handles many generic parks: different addresses, same address, no address", () => {
    const parks = [
      p(1, { addressLine: "860 Avenue De l'Aigoual" }),
      p(2, { addressLine: "387 Avenue De l'Aigoual" }),
      p(3, { addressLine: "387 Avenue De l'Aigoual" }),
      p(4, { addressLine: null }),
      p(5, { addressLine: null }),
    ];
    const slugs = assignSlugs(parks);
    expect(new Set(slugs.values()).size).toBe(5);
    expect(slugs.get(uuid(1))).toBe("aire-de-jeux-860-avenue-de-l-aigoual");
    expect(slugs.get(uuid(2))).toBe("aire-de-jeux-387-avenue-de-l-aigoual");
    expect(slugs.get(uuid(3))).toMatch(/^aire-de-jeux-387-avenue-de-l-aigoual-[0-9a-f]{6}$/);
    expect(slugs.get(uuid(4))).toMatch(/^aire-de-jeux-[0-9a-f]{6}$/);
  });

  it("is independent of the input order", () => {
    const parks = [p(3, { addressLine: "1 Rue A" }), p(1, { addressLine: "1 Rue A" }), p(2, { addressLine: "1 Rue A" })];
    const a = assignSlugs(parks);
    const b = assignSlugs([...parks].reverse());
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it("scales to hundreds of identical parks with unique slugs", () => {
    const parks = many(300, () => park({ addressLine: "1 Rue A" }));
    expect(new Set(assignSlugs(parks).values()).size).toBe(300);
  });

  it("extends the id suffix when short ids collide", () => {
    // deux uuid dont les 6 premiers caractères hexadécimaux sont identiques
    const a = park({ id: "abcdef00-0000-4000-8000-000000000001", addressLine: "1 Rue A" });
    const b = park({ id: "abcdef00-0000-4000-8000-000000000002", addressLine: "1 Rue A" });
    const c = park({ id: "abcdef00-0000-4000-8000-000000000003", addressLine: "1 Rue A" });
    const slugs = assignSlugs([a, b, c]);
    expect(new Set(slugs.values()).size).toBe(3);
  });

  it("never rewrites a published slug and avoids it for newcomers", () => {
    const existing = new Map([[uuid(1), "parc-historique"]]);
    const parks = [p(1, { name: "Nom Changé" }), p(2, { name: "Parc Historique" })];
    const slugs = assignSlugs(parks, { existing });
    expect(slugs.get(uuid(1))).toBe("parc-historique");
    expect(slugs.get(uuid(2))).not.toBe("parc-historique");
  });

  it("throws when existing slugs contradict each other", () => {
    const existing = new Map([[uuid(1), "x"], [uuid(2), "x"]]);
    expect(() => assignSlugs([p(1), p(2)], { existing })).toThrow(/en double/);
  });
});

describe("planSlugHistory", () => {
  it("records only real changes (→ 301 redirects)", () => {
    const prev = new Map([[uuid(1), "ancien"], [uuid(2), "stable"]]);
    const next = new Map([[uuid(1), "nouveau"], [uuid(2), "stable"], [uuid(3), "neuf"]]);
    expect(planSlugHistory(prev, next)).toEqual([{ parkId: uuid(1), oldSlug: "ancien", newSlug: "nouveau" }]);
  });
});
