import { SITE_NAME, SITE_URL } from "../../config/site";
import { sanityImage } from "./images";
import type { Article } from "./types";

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** Titre et description SEO (valeurs dédiées de l'éditeur, sinon titre/résumé), image de partage 1200×630. */
export function articleMeta(article: Article) {
  const cover = article.cover?.url;
  return {
    title: article.seoTitle?.trim() || article.title,
    description: clip(article.seoDescription?.trim() || article.excerpt, 200),
    image: cover ? sanityImage(cover, { w: 1200, h: 630 }) : undefined,
    imageAlt: article.cover?.alt || article.title,
    article: {
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt ?? undefined,
      section: article.category?.title,
      author: article.author?.name,
    },
  };
}

/** Données structurées schema.org Article (uniquement des champs réellement présents). */
export function articleJsonLd(article: Article): Record<string, unknown> {
  const meta = articleMeta(article);
  const url = new URL(`/guides/${article.slug}/`, SITE_URL).toString();
  return {
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: clip(article.title, 110),
    description: meta.description,
    ...(meta.image ? { image: [meta.image] } : {}),
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    ...(article.category ? { articleSection: article.category.title } : {}),
    ...(article.author ? { author: { "@type": "Person", name: article.author.name } } : {}),
    publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: new URL("/icon-512.png", SITE_URL).toString() } },
  };
}
