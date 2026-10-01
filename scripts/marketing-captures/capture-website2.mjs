#!/usr/bin/env node
/**
 * Captures marketing Website-2 — 4 écrans RÉELS de apps/mobile (Explorer,
 * Fiche parc, Filtres, Favoris), rendus en PNG par Playwright pour
 * apps/landing/public/screenshots/.
 *
 * Outil de dev ponctuel, volontairement séparé du code applicatif : il ne
 * modifie jamais apps/mobile, n'injecte aucun HTML/CSS de complaisance et ne
 * fabrique aucune donnée — il pilote l'UI réelle (clics, formulaire de
 * connexion réel) exactement comme un utilisateur le ferait.
 *
 * Prérequis avant de lancer ce script :
 *   1. Supabase LOCAL démarré : `supabase start`
 *   2. Serveur mobile démarré : `npm run dev:mobile` (par défaut :5173)
 *   3. `.env.local` à la racine, avec VITE_SUPABASE_URL pointant vers
 *      127.0.0.1/localhost (voir garde-fou ci-dessous)
 *   4. Le compte de test `website2-captures-test@toboggo.local` doit déjà
 *      exister en local avec ses 4 favoris (créé manuellement lors de
 *      l'audit Website-2 — ce script ne le recrée pas).
 *
 * Usage :
 *   npm run captures:marketing
 *   MOBILE_BASE_URL=http://localhost:5555 npm run captures:marketing
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.resolve(ROOT, "apps/landing/public/screenshots");
const BASE_URL = process.env.MOBILE_BASE_URL ?? "http://localhost:5173";

const TEST_ACCOUNT = {
  email: "website2-captures-test@toboggo.local",
  password: "Captures2026Test!",
};

// Coordonnées réelles de Tarbes — seule zone du jeu de données local (2201
// parcs OSM) avec une vraie densité de parcs autour d'elle. Voir le rapport
// de l'audit assets Website-2 pour le détail.
const TARBES = { latitude: 43.238493, longitude: 0.076573 };

const PARK_ROBESPIERRE_ID = "24bffa92-6fd9-407f-80a6-378a7a35ca0a";

/**
 * Garde-fou anti-prod : refuse de s'exécuter si .env.local n'existe pas ou
 * si VITE_SUPABASE_URL ne pointe pas explicitement vers 127.0.0.1/localhost.
 * Ce script ne doit JAMAIS pouvoir toucher une instance Supabase distante.
 */
function assertLocalSupabase() {
  try {
    process.loadEnvFile(path.resolve(ROOT, ".env.local"));
  } catch {
    console.error(
      "[capture-website2] .env.local introuvable à la racine du repo.\n" +
        "Protection anti-prod : ce script refuse de s'exécuter tant qu'il ne peut pas confirmer qu'il pointe vers une instance Supabase LOCALE. Abandon.",
    );
    process.exit(1);
  }
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);
  if (!isLocal) {
    console.error(
      `[capture-website2] VITE_SUPABASE_URL ("${url || "absent"}") ne pointe pas vers 127.0.0.1/localhost.\n` +
        "Protection anti-prod : ce script refuse de s'exécuter en dehors d'un environnement local/dev. Abandon.",
    );
    process.exit(1);
  }
  console.log(`[capture-website2] Garde-fou OK — Supabase local confirmé (${url}).`);
}

async function assertMobileServerReachable() {
  try {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(
      `[capture-website2] Impossible de joindre ${BASE_URL} (${err.message}).\n` +
        "Démarrez d'abord le serveur mobile : npm run dev:mobile. Abandon.",
    );
    process.exit(1);
  }
  console.log(`[capture-website2] Serveur mobile joignable sur ${BASE_URL}.`);
}

async function captureExplorer(page, outDir) {
  await page.goto(`${BASE_URL}/map`);
  // L'app demande la position automatiquement au montage (voir
  // apps/mobile/src/screens/map/MapExplore.tsx) — avec la permission déjà
  // accordée via context.grantPermissions, le panneau "Activer la
  // localisation" ne devrait normalement jamais apparaître. On le gère quand
  // même défensivement au cas où la géoloc automatique échoue.
  await page.waitForTimeout(1000);
  const locBtn = page.getByText("Activer la localisation");
  if (await locBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await locBtn.click();
  }
  try {
    await page.getByText(/parcs? à moins de/).first().waitFor({ timeout: 20000 });
  } catch (err) {
    const debugPath = path.join(outDir, "_debug-explorer-timeout.png");
    await page.screenshot({ path: debugPath }).catch(() => {});
    const bodyText = await page.textContent("body").catch(() => "(indisponible)");
    console.error(`[capture-website2] Explorer : timeout en attendant les parcs. Debug: ${debugPath}`);
    console.error(`[capture-website2] Contenu de la page au moment du timeout:\n${bodyText}`);
    throw err;
  }
  await page.waitForTimeout(1500); // laisser les tuiles de la carte peindre
  const expandBtn = page.getByRole("button", { name: "Afficher les parcs autour de vous" });
  if (await expandBtn.isVisible().catch(() => false)) {
    await expandBtn.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(outDir, "explorer.png") });
  console.log("  explorer.png ✓");
}

async function captureParkDetail(page, outDir) {
  await page.goto(`${BASE_URL}/park/${PARK_ROBESPIERRE_ID}`);
  try {
    await page.getByText("Aire de jeux Robespierre").waitFor({ timeout: 15000 });
  } catch (err) {
    const debugPath = path.join(outDir, "_debug-park-detail-timeout.png");
    await page.screenshot({ path: debugPath }).catch(() => {});
    const bodyText = await page.textContent("body").catch(() => "(indisponible)");
    console.error(`[capture-website2] Fiche parc : timeout. Debug: ${debugPath}`);
    console.error(`[capture-website2] Contenu de la page au moment du timeout:\n${bodyText}`);
    throw err;
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "park-detail.png") });
  console.log("  park-detail.png ✓");
}

async function captureFilters(page, outDir) {
  await page.goto(`${BASE_URL}/map`);
  await page.getByRole("button", { name: "Filtres" }).click();
  const wc = page.getByRole("button", { name: "Toilettes", exact: true });
  await wc.waitFor({ timeout: 10000 });
  await wc.click();
  await page.getByRole("button", { name: "Clôturé", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, "filters.png") });
  console.log("  filters.png ✓");
}

async function captureFavorites(page, outDir) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#auth-email", TEST_ACCOUNT.email);
  await page.fill("#auth-pwd", TEST_ACCOUNT.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/map$/, { timeout: 15000 });
  await page.goto(`${BASE_URL}/favorites`);
  await page.getByText("Splash Park").waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "favorites.png") });
  console.log("  favorites.png ✓");
}

async function main() {
  assertLocalSupabase();
  await assertMobileServerReachable();
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    // Sans ceci, navigator.language est "en-US" par défaut dans Chromium
    // headless : l'app détecte alors l'anglais (voir apps/mobile/src/i18n/
    // detect.ts) et les captures rendraient le site marketing en anglais.
    locale: "fr-FR",
  });
  await context.grantPermissions(["geolocation"], { origin: BASE_URL });
  await context.setGeolocation(TARBES);

  const page = await context.newPage();

  console.log("[capture-website2] Capture des 4 écrans...");
  await captureExplorer(page, OUT_DIR);
  await captureParkDetail(page, OUT_DIR);
  await captureFilters(page, OUT_DIR);
  await captureFavorites(page, OUT_DIR);

  await browser.close();
  console.log(`[capture-website2] Terminé — fichiers dans ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[capture-website2] Échec :", err);
  process.exit(1);
});
