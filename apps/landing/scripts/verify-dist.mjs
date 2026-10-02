#!/usr/bin/env node
/**
 * Vérifie la cohérence SEO du dossier dist/ (à lancer après `npm run build:landing`) :
 *   - chaque URL du sitemap correspond à une page générée, avec slash final ;
 *   - aucune page noindex dans le sitemap ; toute page indexable y figure ;
 *   - canonical absolu, auto-référent, avec slash final (sauf la 404, sans canonical) ;
 *   - aucun lien interne vers une page non générée ni sans slash final ;
 *   - toute ville générée est listée dans le hub (et inversement).
 * Code de sortie 1 au moindre écart. Aucune écriture, aucun réseau.
 *
 * Usage : node scripts/verify-dist.mjs [dist]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = process.argv[2] ?? "dist";
const SITE = "https://toboggo-website.vercel.app";
const errors = [];
const fail = (msg) => errors.push(msg);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(DIST).map((f) => relative(DIST, f).split("\\").join("/"));
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const pathOf = (file) => (file === "index.html" ? "/" : file === "404.html" ? "/404" : `/${file.replace(/index\.html$/, "")}`);
const read = (file) => readFileSync(join(DIST, file), "utf8");

const pages = new Map(htmlFiles.map((f) => [pathOf(f), read(f)]));
const robotsOf = (html) => /name="robots" content="([^"]*)"/.exec(html)?.[1] ?? "index,follow";

// sitemap
const sitemapFiles = files.filter((f) => /^sitemap-\d+\.xml$/.test(f));
if (sitemapFiles.length === 0) fail("aucun sitemap-N.xml dans dist");
const sitemapUrls = sitemapFiles.flatMap((f) => [...read(f).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const sitemapPaths = new Set();
for (const url of sitemapUrls) {
  if (!url.startsWith(SITE)) fail(`sitemap : URL hors domaine ${url}`);
  const path = url.slice(SITE.length);
  sitemapPaths.add(path);
  if (!path.endsWith("/")) fail(`sitemap : pas de slash final ${url}`);
  if (!pages.has(path)) fail(`sitemap : URL non générée ${url}`);
  else if (robotsOf(pages.get(path)).includes("noindex")) fail(`sitemap : page noindex listée ${url}`);
}

for (const [path, html] of pages) {
  const robots = robotsOf(html);
  const canonical = /rel="canonical" href="([^"]*)"/.exec(html)?.[1];
  if (path === "/404") {
    if (canonical) fail("404 : ne doit pas avoir de canonical");
    if (!robots.includes("noindex")) fail("404 : doit être noindex");
    continue;
  }
  if (!canonical) fail(`${path} : canonical absent`);
  else if (canonical !== `${SITE}${path}`) fail(`${path} : canonical non auto-référent (${canonical})`);
  if (!robots.includes("noindex") && !sitemapPaths.has(path)) fail(`${path} : indexable mais absente du sitemap`);

  for (const href of new Set([...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]))) {
    if (/^(mailto:|https?:|#)/.test(href)) continue;
    const [pathname] = href.split("#")[0].split("?");
    if (!pathname) continue;
    const last = pathname.split("/").pop() ?? "";
    if (!last.includes(".") && !pathname.endsWith("/")) fail(`${path} : lien interne sans slash final (${href})`);
    if (!pages.has(pathname) && !files.includes(pathname.replace(/^\//, ""))) fail(`${path} : lien vers une page non générée (${href})`);
  }
}

// villes générées ⇔ listées dans le hub
const cityDirs = readdirSync(join(DIST, "aires-de-jeux"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const hub = pages.get("/aires-de-jeux/") ?? "";
for (const city of cityDirs) {
  if (!hub.includes(`href="/aires-de-jeux/${city}/"`)) fail(`ville générée absente du hub : ${city}`);
  if (!sitemapPaths.has(`/aires-de-jeux/${city}/`) && !robotsOf(pages.get(`/aires-de-jeux/${city}/`) ?? "").includes("noindex")) fail(`ville indexable absente du sitemap : ${city}`);
}
for (const m of hub.matchAll(/href="\/aires-de-jeux\/([^/"]+)\/"/g)) if (!cityDirs.includes(m[1])) fail(`hub : lien vers une ville non générée (${m[1]})`);

console.log(`pages HTML : ${htmlFiles.length} | URLs sitemap : ${sitemapPaths.size} | villes générées : ${cityDirs.join(", ") || "aucune"}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} problème(s) :\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-dist : OK");
