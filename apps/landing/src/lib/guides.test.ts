import { describe, expect, it } from "vitest";
import { guideArticleLd, guideSchema, isGuidesIndexable, unknownRelatedPlaces } from "./guides";

const base = {
  title: "Comment choisir une aire de jeux adaptée à l'âge de son enfant ?",
  description: "Les critères à regarder avant de choisir une aire de jeux : tranche d'âge, clôture, ombre, accessibilité et équipements.",
  slug: "choisir-aire-de-jeux-age-enfant",
  status: "published" as const,
  publishedAt: "2026-11-01",
};

describe("guide schema", () => {
  it("accepts a real published article and defaults optional lists", () => {
    const g = guideSchema.parse(base);
    expect(g.relatedPlaces).toEqual([]);
    expect(g.faq).toEqual([]);
  });

  it("rejects a published article without a real publication date", () => {
    expect(guideSchema.safeParse({ ...base, publishedAt: undefined }).success).toBe(false);
    expect(guideSchema.safeParse({ ...base, status: "draft", publishedAt: undefined }).success).toBe(true);
  });

  it("rejects bad slugs, backdated updates and rights-less images", () => {
    expect(guideSchema.safeParse({ ...base, slug: "Mauvais Slug" }).success).toBe(false);
    expect(guideSchema.safeParse({ ...base, updatedAt: "2026-10-01" }).success).toBe(false);
    expect(guideSchema.safeParse({ ...base, image: { src: "/x.webp", alt: "Une aire de jeux" } }).success).toBe(false);
  });
});

describe("guides gating and links", () => {
  it("/guides/ is indexable only from 3 published articles", () => {
    const g = (status: "draft" | "published") => ({ status });
    expect(isGuidesIndexable([g("published"), g("published"), g("draft")])).toBe(false);
    expect(isGuidesIndexable([g("published"), g("published"), g("published")])).toBe(true);
    expect(isGuidesIndexable([])).toBe(false);
  });

  it("flags related places that have no generated page", () => {
    expect(unknownRelatedPlaces({ relatedPlaces: ["millau", "rodez"] }, new Set(["millau"]))).toEqual(["rodez"]);
  });

  it("signs with the Organization when no real author exists, and never invents dates", () => {
    const ld = guideArticleLd(guideSchema.parse({ ...base, status: "draft", publishedAt: undefined })) as { author: { "@type": string }; datePublished?: string };
    expect(ld.author["@type"]).toBe("Organization");
    expect(ld.datePublished).toBeUndefined();
    const named = guideArticleLd(guideSchema.parse({ ...base, author: { name: "Camille Martin" } })) as { author: { "@type": string; name: string }; datePublished: string };
    expect(named.author).toMatchObject({ "@type": "Person", name: "Camille Martin" });
    expect(named.datePublished).toBe("2026-11-01T00:00:00.000Z");
  });
});
