import { SITE_NAME, SITE_URL } from "../../config/site";
import { sanityImage } from "./images";
import type { Article } from "./types";

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/**
 * Date de dernière modification de l'article publié : `_updatedAt` (Sanity, mis à jour à chaque publication),
 * `publishedAt` en secours. Jamais antérieure à `publishedAt` (article antidaté ou programmé), car
 * `dateModified` < `datePublished` serait invalide. Le champ éditorial `updatedAt` ne sert qu'à l'affichage
 * (« Mis à jour le … »).
 */
export function articleModifiedAt(article: Pick<Article, "publishedAt" | "_updatedAt">): string {
  const updated = article._updatedAt;
  if (!updated || Number.isNaN(Date.parse(updated))) return article.publishedAt;
  return Date.parse(updated) < Date.parse(article.publishedAt) ? article.publishedAt : updated;
}

/** « Toboggo » ou « Équipe Toboggo » (casse et accents ignorés) : signature éditoriale de la marque, pas une personne. */
const EDITORIAL_AUTHOR = /^(?:l['’]\s*)?(?:equipe\s+)?toboggo$/;

export function isEditorialAuthor(name: string): boolean {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return EDITORIAL_AUTHOR.test(normalized);
}

/** Auteur schema.org : `Organization` pour la signature éditoriale Toboggo, `Person` pour un auteur individuel. */
export function authorLd(author: { name: string }): Record<string, unknown> {
  return isEditorialAuthor(author.name)
    ? { "@type": "Organization", name: SITE_NAME, url: SITE_URL }
    : { "@type": "Person", name: author.name };
}

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
      modifiedTime: articleModifiedAt(article),
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
    dateModified: articleModifiedAt(article),
    ...(article.category ? { articleSection: article.category.title } : {}),
    ...(article.author ? { author: authorLd(article.author) } : {}),
    publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: new URL("/icon-512.png", SITE_URL).toString() } },
  };
}
