import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// URL réellement déployée aujourd'hui (voir docs/architecture/database-migration.md
// §11 CHECKPOINT). À remplacer si/quand un domaine personnalisé est attaché au
// projet Vercel "toboggo-website" — n'affecte que le sitemap et les canonicals.
const SITE_URL = "https://toboggo-website.vercel.app";

// Pages "shell only" de Website-1 : le Header/Footer y pointe déjà (pour ne
// jamais afficher de lien mort) mais leur contenu réel arrive dans un lot
// dédié (Website-3/4/5/6). Exclues du sitemap ; chacune pose aussi son propre
// <meta name="robots" content="noindex,nofollow"> via BaseLayout (voir pages).
const SHELL_ONLY_PATHS = ["/fonctionnalites", "/guides", "/collectivites", "/a-propos"];

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
