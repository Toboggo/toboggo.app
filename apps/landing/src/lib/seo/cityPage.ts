/**
 * Données d'une page de ville, chargées depuis Supabase au BUILD (jamais
 * copiées dans le dépôt) puis découpées pour l'affichage :
 *   - `documented` : parcs avec fiche détaillée ;
 *   - `others`     : parcs affichables mais trop pauvres → liste compacte.
 * L'éligibilité (index / sitemap) vient de eligibility.ts.
 */
import { SEO_CITIES, cityPath, HUB_PATH, type SeoCity } from "./cities";
import { evaluateEligibility, isDocumented, isListable, type Eligibility } from "./eligibility";
import type { SeoPark } from "./parks";
import { fetchCityParks, readConfig } from "./supabase";

export interface CityPageData {
  city: SeoCity;
  /** Tous les parcs publiés/actifs de la ville (avant filtrage d'affichage). */
  parks: SeoPark[];
  listed: SeoPark[];
  documented: SeoPark[];
  others: SeoPark[];
  eligibility: Eligibility;
}

export function buildCityPageData(city: SeoCity, parks: SeoPark[]): CityPageData {
  const listed = parks.filter(isListable);
  const documented = listed.filter(isDocumented);
  const others = listed.filter((p) => !isDocumented(p));
  return { city, parks, listed, documented, others, eligibility: evaluateEligibility(parks) };
}

const cache = new Map<string, Promise<CityPageData[] | null>>();

/**
 * `null` = pas de configuration Supabase (ex. build sans variables) : aucune
 * page de ville n'est générée. Une configuration présente mais en échec lève
 * une erreur : mieux vaut un build rouge qu'une page vide publiée.
 */
export function loadCities(env: Record<string, string | undefined>): Promise<CityPageData[] | null> {
  const config = readConfig(env);
  if (!config) return Promise.resolve(null);
  const key = `${config.url}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = Promise.all(SEO_CITIES.map(async (city) => buildCityPageData(city, await fetchCityParks(config, city))));
    cache.set(key, promise);
  }
  return promise;
}

/** Chemins à exclure du sitemap (pages en noindex ou non générées). */
export function sitemapExclusions(cities: CityPageData[] | null): string[] {
  if (!cities) return [HUB_PATH, ...SEO_CITIES.map(cityPath)];
  const excluded = cities.filter((c) => !c.eligibility.eligible).map((c) => cityPath(c.city));
  if (!cities.some((c) => c.eligibility.eligible)) excluded.push(HUB_PATH);
  return excluded;
}
