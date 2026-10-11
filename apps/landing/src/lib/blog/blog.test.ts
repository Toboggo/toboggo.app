import { evaluate, parse } from "groq-js";
import { describe, expect, it } from "vitest";
import { createPreviewCookieValue, isValidPreviewCookie, safePreviewRedirect } from "./previewSession";
import { renderBody } from "./portableText";
import { articleJsonLd, articleMeta } from "./seo";
import { BY_SLUG_QUERY, LIST_QUERY } from "./queries";
import type { Article } from "./types";

const past = "2020-01-01T00:00:00Z";
const future = "2999-01-01T00:00:00Z";
const doc = (id: string, slug: string, publishedAt: string | undefined, extra = {}) => ({
  _id: id,
  _type: "article",
  title: `T ${id}`,
  slug: { current: slug },
  excerpt: "x",
  publishedAt,
  ...extra,
});
const dataset = [
  doc("a1", "publie", past),
  doc("drafts.a2", "brouillon", past),
  doc("a3", "futur", future),
  doc("a4", "sans-date", undefined),
  { ...doc("a5", "x", past), slug: undefined },
  doc("drafts.a1", "publie", past, { title: "Version brouillon" }),
];

async function run(query: string, params = {}) {
  return (await evaluate(parse(query, { params }), { dataset, params })).get();
}

describe("requêtes GROQ du blog", () => {
  it("la liste n'expose que les articles publiés, datés, avec slug (ni brouillon, ni futur)", async () => {
    const list = (await run(LIST_QUERY)) as { slug: string; title: string }[];
    expect(list.map((a) => a.slug)).toEqual(["publie"]);
    expect(list[0].title).toBe("T a1");
  });

  it("le détail d'un brouillon ou d'un article futur est introuvable", async () => {
    expect(await run(BY_SLUG_QUERY, { slug: "brouillon" })).toBeNull();
    expect(await run(BY_SLUG_QUERY, { slug: "futur" })).toBeNull();
    expect(((await run(BY_SLUG_QUERY, { slug: "publie" })) as { title: string }).title).toBe("T a1");
  });
});

describe("session de prévisualisation", () => {
  const key = "jeton-de-test";
  it("accepte un cookie valide, refuse falsifié, expiré ou sans clé", () => {
    const now = Date.now();
    const value = createPreviewCookieValue(now, key);
    expect(isValidPreviewCookie(value, now + 1000, key)).toBe(true);
    expect(isValidPreviewCookie(value, now + 3601 * 1000, key)).toBe(false);
    expect(isValidPreviewCookie(value, now, "autre-cle")).toBe(false);
    expect(isValidPreviewCookie(`${value.split(".")[0]}.${"0".repeat(64)}`, now, key)).toBe(false);
    expect(isValidPreviewCookie(undefined, now, key)).toBe(false);
    expect(isValidPreviewCookie(value, now, undefined)).toBe(false);
  });
  it("ne redirige que vers /apercu/<slug>/", () => {
    expect(safePreviewRedirect("/apercu/mon-article/")).toBe("/apercu/mon-article/");
    expect(safePreviewRedirect("https://evil.example/")).toBe("/guides/");
    expect(safePreviewRedirect("//evil.example/")).toBe("/guides/");
  });
});

describe("contenu riche", () => {
  it("produit du HTML échappé avec titres, liens filtrés et images à alt", () => {
    const html = renderBody([
      { _type: "block", style: "h2", children: [{ _type: "span", text: "Titre <b>", marks: [] }], markDefs: [] },
      {
        _type: "block",
        style: "normal",
        markDefs: [
          { _key: "l1", _type: "link", href: "https://exemple.fr/?a=1&b=2" },
          { _key: "l2", _type: "link", href: "javascript:alert(1)" },
        ],
        children: [
          { _type: "span", text: "ok", marks: ["l1"] },
          { _type: "span", text: "mal", marks: ["l2"] },
        ],
      },
      { _type: "image", url: "https://cdn.sanity.io/images/p/d/abc-800x600.jpg", width: 800, height: 600, alt: 'Un "parc"' },
    ]);
    expect(html).toContain("<h2>Titre &lt;b&gt;</h2>");
    expect(html).toContain('href="https://exemple.fr/?a=1&amp;b=2"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain('alt="Un &quot;parc&quot;"');
  });
});

describe("SEO article", () => {
  const article: Article = {
    _id: "a1",
    _updatedAt: past,
    title: "Mon titre",
    slug: "mon-titre",
    excerpt: "Un résumé suffisamment long.",
    publishedAt: "2026-01-02T08:00:00Z",
    updatedAt: "2026-02-03T08:00:00Z",
    category: { title: "Conseils", slug: "conseils" },
    author: { name: "Équipe Toboggo" },
    cover: { url: "https://cdn.sanity.io/images/p/d/c-1200x800.jpg", alt: "Un toboggan" },
    body: [],
    seoTitle: "Titre SEO",
  };
  it("utilise le titre/description SEO dédiés, sinon repli sur titre/résumé", () => {
    expect(articleMeta(article).title).toBe("Titre SEO");
    expect(articleMeta({ ...article, seoTitle: null }).title).toBe("Mon titre");
    expect(articleMeta(article).description).toBe(article.excerpt);
  });
  it("génère un JSON-LD Article cohérent", () => {
    const ld = articleJsonLd(article) as Record<string, any>;
    expect(ld["@type"]).toBe("Article");
    expect(ld.datePublished).toBe("2026-01-02T08:00:00Z");
    expect(ld.dateModified).toBe("2026-02-03T08:00:00Z");
    expect(ld.author.name).toBe("Équipe Toboggo");
    expect(ld.mainEntityOfPage["@id"]).toMatch(/\/guides\/mon-titre\/$/);
  });
});
