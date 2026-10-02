/**
 * Snapshot partagé : UN seul chargement par build, utilisé par la configuration
 * Astro (sitemap), les pages (hub, villes) et la home.
 *
 * La config Astro et le rendu des pages n'ont pas le même graphe de modules ;
 * la promesse est donc stockée sur `globalThis` (même processus Node) pour que
 * les deux voient le MÊME résultat sans second appel réseau.
 *
 * Hors ligne / tests : `SEO_SNAPSHOT_FILE=/chemin/snapshot.json` lit un
 * snapshot enregistré au lieu d'appeler Supabase.
 */
import { readFileSync } from "node:fs";
import { fetchSnapshot, readConfig, SeoLoadError, type SeoSnapshot } from "./loader";

const KEY = Symbol.for("toboggo.seo.snapshot");

type Cache = Map<string, Promise<SeoSnapshot | null>>;

function cache(): Cache {
  const g = globalThis as unknown as Record<symbol, Cache | undefined>;
  return (g[KEY] ??= new Map());
}

export function loadSnapshot(env: Record<string, string | undefined>): Promise<SeoSnapshot | null> {
  // `env` = variables PUBLIC_* (Vite) ; SEO_SNAPSHOT_FILE vient du processus.
  const merged = { ...process.env, ...env };
  const file = merged.SEO_SNAPSHOT_FILE?.trim();
  const config = readConfig(merged);
  const key = file ? `file:${file}` : config ? `url:${config.url}` : "none";
  const store = cache();
  let promise = store.get(key);
  if (!promise) {
    promise = (async () => {
      try {
        if (file) return JSON.parse(readFileSync(file, "utf8")) as SeoSnapshot;
        if (!config) return null;
        const snapshot = await fetchSnapshot(config);
        console.info(`[seo] snapshot : ${snapshot.stats.parkRows} parcs en ${snapshot.stats.requests} requêtes (lecture seule)`);
        return snapshot;
      } catch (error) {
        const reason = (error instanceof Error ? error.message : String(error)).replace(/^\[seo\] /, "");
        throw new SeoLoadError(`le snapshot Supabase n'a pas pu être chargé — ${reason}`);
      }
    })();
    store.set(key, promise);
  }
  return promise;
}

/** Réservé aux tests. */
export function resetSnapshotCache(): void {
  cache().clear();
}
