import { publishedClient, previewClient } from "./client";
import { BY_SLUG_QUERY, LIST_QUERY, PREVIEW_BY_SLUG_QUERY } from "./queries";
import type { Article, ArticleCard } from "./types";

// Un échec Sanity au build doit faire échouer le build (sinon le blog et ses entrées de sitemap disparaîtraient
// silencieusement) ; la liste est mémoïsée pour n'interroger Sanity qu'une fois par build.
let listPromise: Promise<ArticleCard[]> | undefined;

export function getArticles(): Promise<ArticleCard[]> {
  listPromise ??= publishedClient.fetch<ArticleCard[]>(LIST_QUERY);
  return listPromise;
}

export function getArticle(slug: string): Promise<Article | null> {
  return publishedClient.fetch<Article | null>(BY_SLUG_QUERY, { slug });
}

export function getPreviewArticle(slug: string): Promise<Article | null> {
  return previewClient().fetch<Article | null>(PREVIEW_BY_SLUG_QUERY, { slug });
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
