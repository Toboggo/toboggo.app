import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE_URL } from "./src/config/site.ts";

// Domaine centralisé dans src/config/site.ts (canonicals, OG, sitemap, robots.txt).

// Pages volontairement hors sitemap : elles posent aussi leur propre
// <meta name="robots" content="noindex,nofollow"> via BaseLayout.
// - /guides : aucun vrai article tant que le contenu éditorial n'existe pas ;
// - /mentions-legales : informations société à compléter (champs « À compléter
//   avant publication »).
// Retirer une page de cette liste ET son `noindex` seulement quand elle est finalisée.
const SHELL_ONLY_PATHS = ["/guides", "/mentions-legales"];

export default defineConfig({
  site: SITE_URL,
  output: "static",
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, "");
        return !SHELL_ONLY_PATHS.includes(path);
      },
    }),
  ],
});
