/**
 * Architecture des guides — PRÉPARATION (Phase 2B) : aucun article, aucune page
 * /guides/[slug]/, aucune dépendance MDX ajoutée.
 *
 * Quand les premiers articles réels existeront, ils vivront dans
 * `src/content/guides/*.mdx` (Astro Content Collections). Ce schéma sert déjà de
 * contrat : il est volontairement identique aux champs d'un futur document
 * Sanity, pour que la migration éventuelle soit un script (voir seo/GUIDES.md).
 *
 * Règles de fond (rappel produit) : pas de faux auteur, pas de fausse date,
 * pas de statistique inventée ; un article sans auteur réel est signé par
 * l'Organisation Toboggo.
 */
import { z } from "astro/zod";
import { SITE_NAME, SITE_URL } from "../config/site";

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug en minuscules, chiffres et tirets");

export const guideSchema = z
  .object({
    title: z.string().min(10).max(110),
    description: z.string().min(70).max(170),
    slug,
    status: z.enum(["draft", "published"]),
    /** Dates réelles de publication / mise à jour (jamais antidatées). */
    publishedAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
    /** Auteur réel ; absent → Organisation Toboggo. */
    author: z.object({ name: z.string().min(2), url: z.url().optional() }).optional(),
    /** Image : uniquement avec droits validés (source + licence + alt obligatoires). */
    image: z
      .object({ src: z.string(), alt: z.string().min(5), license: z.string().min(2), credit: z.string().min(2) })
      .optional(),
    /** Slugs de villes liées (vérifiés au build contre les pages réellement générées). */
    relatedPlaces: z.array(slug).default([]),
    /** Sections FAQ visibles (seules celles-ci peuvent alimenter un FAQPage). */
    faq: z.array(z.object({ question: z.string().min(5), answer: z.string().min(10) })).default([]),
  })
  .superRefine((guide, ctx) => {
    if (guide.status === "published" && !guide.publishedAt) {
      ctx.addIssue({ code: "custom", path: ["publishedAt"], message: "un article publié doit avoir une date de publication réelle" });
    }
    if (guide.updatedAt && guide.publishedAt && guide.updatedAt < guide.publishedAt) {
      ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt antérieur à publishedAt" });
    }
  });

export type GuideFrontmatter = z.infer<typeof guideSchema>;

/** Nombre d'articles publiés à partir duquel l'index /guides/ devient indexable. */
export const MIN_PUBLISHED_GUIDES = 3;

export function publishedGuides<T extends Pick<GuideFrontmatter, "status">>(guides: readonly T[]): T[] {
  return guides.filter((g) => g.status === "published");
}

export function isGuidesIndexable(guides: readonly Pick<GuideFrontmatter, "status">[]): boolean {
  return publishedGuides(guides).length >= MIN_PUBLISHED_GUIDES;
}

/** Slugs de villes référencés par un guide mais sans page générée : le build doit échouer. */
export function unknownRelatedPlaces(guide: Pick<GuideFrontmatter, "relatedPlaces">, publishedPlaceSlugs: ReadonlySet<string>): string[] {
  return guide.relatedPlaces.filter((s) => !publishedPlaceSlugs.has(s));
}

/** JSON-LD Article : uniquement des propriétés présentes dans le contenu. */
export function guideArticleLd(guide: GuideFrontmatter): Record<string, unknown> {
  const url = new URL(`/guides/${guide.slug}/`, SITE_URL).toString();
  return {
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    mainEntityOfPage: url,
    inLanguage: "fr",
    ...(guide.publishedAt ? { datePublished: guide.publishedAt.toISOString() } : {}),
    ...(guide.updatedAt ? { dateModified: guide.updatedAt.toISOString() } : {}),
    author: guide.author ? { "@type": "Person", name: guide.author.name, ...(guide.author.url ? { url: guide.author.url } : {}) } : { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    ...(guide.image ? { image: new URL(guide.image.src, SITE_URL).toString() } : {}),
  };
}
