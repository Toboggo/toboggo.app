/**
 * i18n — chargement paresseux des catalogues, un chunk par (langue, namespace).
 *
 * `import.meta.glob` (Vite) transforme chaque `locales/<lang>/<ns>.json` en import
 * dynamique : seul le namespace réellement utilisé par l'écran courant est
 * téléchargé, et le service worker de la PWA le précache automatiquement. Aucun
 * fichier de traduction unique et monolithique.
 *
 * Un namespace déclaré (`config.NAMESPACES`) mais sans fichier se résout en `{}` :
 * i18next retombe alors sur `fallbackLng` puis sur la clé brute.
 */

import type { Language, Namespace } from "./config";

const catalogs = import.meta.glob("./locales/*/*.json");

export async function loadCatalog(
  language: Language,
  namespace: Namespace,
): Promise<Record<string, unknown>> {
  const path = `./locales/${language}/${namespace}.json`;
  const loader = catalogs[path];
  if (!loader) return {};
  const mod = (await loader()) as { default?: Record<string, unknown> } & Record<string, unknown>;
  return mod.default ?? mod;
}
