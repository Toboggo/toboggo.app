import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import { loadEnv } from "vite";
import { SITE_URL } from "./src/config/site.ts";
import { loadCities, sitemapExclusions } from "./src/lib/seo/cityPage.ts";

// Domaine centralisé dans src/config/site.ts (canonicals, OG, sitemap, robots.txt).

// Pages volontairement hors sitemap : elles posent aussi leur propre
// <meta name="robots" content="noindex,nofollow"> via BaseLayout.
// - /guides : ajouté dynamiquement ci-dessous tant qu'aucun article n'est publié dans Sanity ;
// - /mentions-legales : informations société à compléter (champs « À compléter
//   avant publication »).
// Retirer une page de cette liste ET son `noindex` seulement quand elle est finalisée.
const SHELL_ONLY_PATHS = ["/mentions-legales"];

// Pages SEO locales : le sitemap ne contient une ville (et le hub) que si
// lib/seo/eligibility.ts la juge indexable. Mêmes données, mêmes critères que
// la page elle-même ; sans variables PUBLIC_SUPABASE_* aucune page n'est
// générée et rien n'est listé. Lecture seule.
const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "PUBLIC_");
const seoExclusions = sitemapExclusions(await loadCities(env));

// Blog Sanity : le chargeur d'articles lit process.env (Vercel) ; en local on y recopie .env.local.
const allEnv = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
for (const key of ["SANITY_PROJECT_ID", "SANITY_DATASET", "SANITY_API_READ_TOKEN"]) {
  if (allEnv[key] && !process.env[key]) process.env[key] = allEnv[key];
}
const { getArticles } = await import("./src/lib/blog/articles.ts");
const articles = await getArticles();
// Tant qu'aucun article n'est publié, /guides/ est noindex (voir guides/index.astro) donc hors sitemap.
if (articles.length === 0) SHELL_ONLY_PATHS.push("/guides");
const lastmodByPath = new Map(articles.map((a) => [`/guides/${a.slug}`, a.updatedAt ?? a.publishedAt]));

export default defineConfig({
  site: SITE_URL,
  output: "static",
  // Adapter Vercel : le site reste statique ; seules les routes `prerender = false` (/apercu/*, /api/preview/*)
  // deviennent des fonctions serverless (prévisualisation authentifiée des brouillons).
  adapter: vercel(),
  // Une seule URL par page : toujours avec slash final (canonicals, sitemap, liens
  // internes et vercel.json "trailingSlash" vont dans le même sens).
  trailingSlash: "always",
  // Aucun script inline : les petits <script> de composants sont émis en fichiers /_astro/*.js
  // (au lieu d'être inlinés sous 4 Ko). Permet une CSP « script-src 'self' » sans 'unsafe-inline'.
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [
    sitemap({
      serialize(item) {
        const lastmod = lastmodByPath.get(new URL(item.url).pathname.replace(/\/$/, ""));
        return lastmod ? { ...item, lastmod: new Date(lastmod).toISOString() } : item;
      },
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, "");
        return !SHELL_ONLY_PATHS.includes(path) && !seoExclusions.includes(`${path}/`);
      },
    }),
  ],
});
