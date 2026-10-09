#!/usr/bin/env node
/**
 * Optimisation des images du landing — à relancer à la main quand une image change
 * (n'est PAS exécuté pendant le build). Nécessite `sharp` (déjà installé via Astro).
 *
 *   node apps/landing/scripts/optimize-images.mjs
 *
 * 1. Captures de l'app : tout `public/screenshots/*.png` est converti en WebP SANS PERTE
 *    (pixels strictement identiques, vérifiés) ; le PNG source est ensuite laissé de côté
 *    (supprimez-le de public/ : seul le .webp est servi).
 * 2. Photos du site (`public/images/home/**` — hors captures d'app) : une variante
 *    `<nom>-800.webp` (800 px de large, qualité 82) est générée à côté de l'original ; le
 *    composant PhotoPlaceholder l'utilise automatiquement via `srcset`.
 *
 * Aucune image n'est retouchée : seul le format/la taille d'export change.
 */
import { createRequire } from "node:module";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sharp = createRequire(import.meta.url)("sharp");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const kb = (n) => `${Math.round(n / 1024)} Ko`;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// 1) captures : PNG → WebP sans perte, avec contrôle d'identité des pixels
for (const file of (await walk(path.join(root, "screenshots"))).filter((f) => f.endsWith(".png"))) {
  const target = file.replace(/\.png$/, ".webp");
  const webp = await sharp(file).webp({ lossless: true, effort: 6 }).toBuffer();
  const [a, b] = await Promise.all([sharp(file).raw().toBuffer(), sharp(webp).raw().toBuffer()]);
  if (Buffer.compare(a, b) !== 0) throw new Error(`${file} : le WebP sans perte n'est pas identique au PNG`);
  await writeFile(target, webp); // on écrit le buffer vérifié tel quel (pas de réencodage)
  console.log(`✓ ${path.relative(root, target)}  ${kb((await stat(file)).size)} → ${kb(webp.length)} (pixels identiques)`);
}

// 2) photos du site : variante 800 px
const VARIANT_WIDTH = 800;
for (const file of (await walk(path.join(root, "images", "home"))).filter((f) => f.endsWith(".webp") && !/-\d+\.webp$/.test(f))) {
  const { width } = await sharp(file).metadata();
  if (!width || width <= VARIANT_WIDTH) continue;
  const target = file.replace(/\.webp$/, `-${VARIANT_WIDTH}.webp`);
  const info = await sharp(file).resize({ width: VARIANT_WIDTH }).webp({ quality: 82, effort: 6 }).toFile(target);
  console.log(`✓ ${path.relative(root, target)}  ${kb((await stat(file)).size)} → ${kb(info.size)}`);
}
