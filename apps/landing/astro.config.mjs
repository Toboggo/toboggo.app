import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { loadEnv } from "vite";
import { SITE_URL } from "./src/config/site.ts";
import { HUB_PATH } from "./src/lib/seo/places.ts";
import { loadSeoSite, sitemapExclusions } from "./src/lib/seo/seoSite.ts";

// Domaine centralisé dans src/config/site.ts (canonicals, OG, sitemap, robots.txt).

// Pages volontairement hors sitemap : elles posent aussi leur propre
// <meta name="robots" content="noindex,nofollow"> via BaseLayout.
// - /guides : aucun vrai article tant que le contenu éditorial n'existe pas ;
// - /mentions-legales : informations société à compléter (champs « À compléter
//   avant publication »).
// Retirer une page de cette liste ET son `noindex` seulement quand elle est finalisée.
const SHELL_ONLY_PATHS = ["/guides", "/mentions-legales"];

// Pages SEO locales : une page de ville n'existe que si la ville est validée
// ET éligible (lib/seo/eligibility.ts, source unique) ; elle est alors dans le
// sitemap, sinon elle n'est tout simplement pas générée. Seul le hub peut
// exister sans ville : il est alors noindex et retiré du sitemap. Le snapshot
// Supabase est partagé (un seul chargement par build, lecture seule).
const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "PUBLIC_");
// `astro check` n'a pas besoin du sitemap : pas de lecture réseau dans ce cas.
const isCheck = process.argv.includes("check");
const seoExclusions = isCheck ? [] : sitemapExclusions(await loadSeoSite(env), HUB_PATH);

export default defineConfig({
  site: SITE_URL,
  output: "static",
  // Une seule URL par page : toujours avec slash final (canonicals, sitemap, liens
  // internes et vercel.json "trailingSlash" vont dans le même sens).
  trailingSlash: "always",
  // Aucun script inline : les petits <script> de composants sont émis en fichiers /_astro/*.js
  // (au lieu d'être inlinés sous 4 Ko). Permet une CSP « script-src 'self' » sans 'unsafe-inline'.
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, "");
        return !SHELL_ONLY_PATHS.includes(path) && !seoExclusions.includes(`${path}/`);
      },
    }),
  ],
});
