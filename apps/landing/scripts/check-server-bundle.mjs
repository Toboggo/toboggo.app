// Garde-fou post-build : la fonction serverless (prévisualisation) ne doit importer aucun paquet réservé au build.
// `rolldown` charge un binding natif Linux absent du paquet déployé → 500 FUNCTION_INVOCATION_FAILED au démarrage.
// (Cause d'origine : imports « effet de bord » de @astrojs/vercel ; neutralisés par le plugin de astro.config.mjs.)
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../.vercel/output/functions", import.meta.url));
if (!existsSync(root)) {
  console.log("check-server-bundle : aucune fonction générée (build sans adapter), rien à vérifier.");
  process.exit(0);
}
const FORBIDDEN = /(?:from|import)\s*\(?\s*["'](?:rolldown|vite|@vercel\/routing-utils)["']/;
const offenders = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.m?js$/.test(name) && FORBIDDEN.test(readFileSync(p, "utf8"))) offenders.push(p);
  }
})(root);
if (offenders.length) {
  console.error("Import interdit dans le bundle de la fonction :\n" + offenders.join("\n"));
  process.exit(1);
}
console.log("check-server-bundle : OK (aucun import rolldown/vite dans la fonction).");
