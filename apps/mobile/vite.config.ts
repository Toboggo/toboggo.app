import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Version réelle du package (affichée sur l'écran "À propos" — jamais une
// valeur inventée, cf. refonte profil/réglages §4).
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as { version: string };

// Identifiant de build réel (≠ version produit ci-dessus) : hash court du commit
// — `VERCEL_GIT_COMMIT_SHA` sur Vercel, sinon `git rev-parse` en local, sinon "dev".
// Sert à savoir quel build tourne réellement sur un appareil (À propos, PostHog).
function resolveBuildId(): string {
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  resolve: {
    alias: {
      "@toboggo/design-system": path.resolve(__dirname, "../../packages/design-system/src"),
      "@toboggo/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  optimizeDeps: {
    exclude: ["@toboggo/design-system", "@toboggo/shared"],
  },
  plugins: [
    react(),
    VitePWA({
      // autoUpdate = sw.js généré avec skipWaiting + clientsClaim. L'enregistrement
      // est fait à la main (src/lib/pwa) : le `registerSW` virtuel du plugin recharge
      // la page sans condition à chaque mise à jour, ce qui ferait perdre une saisie.
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      workbox: {
        // Explicites : avec `injectRegister: false` le plugin n'applique plus
        // skipWaiting/clientsClaim de lui-même (il bascule sur un message SKIP_WAITING).
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Toboggo",
        short_name: "Toboggo",
        description: "Trouvez le parc idéal pour vos enfants",
        lang: "fr",
        theme_color: "#16a34a",
        background_color: "#fff8ec",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
