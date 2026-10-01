/**
 * Allowlist des villes qui ont une page SEO locale. SEULES les villes listées
 * ici sont générées (getStaticPaths) : ajouter une ville = une entrée ici,
 * jamais une génération automatique depuis la base. Ce n'est PAS une copie des
 * données (aucun parc ici) : seulement l'identité de la ville et le filtre qui
 * permet de la retrouver dans Supabase.
 *
 * `city` doit correspondre EXACTEMENT à `parks.city` en base ; `countryCode` à
 * `parks.country_code`.
 */
export interface SeoCity {
  /** Segment d'URL : /aires-de-jeux/<slug>/ */
  slug: string;
  /** Nom affiché. */
  name: string;
  /** Valeur exacte de `parks.city`. */
  city: string;
  countryCode: string;
  /** Département, pour le texte d'introduction (donnée géographique stable). */
  department: string;
}

export const SEO_CITIES: readonly SeoCity[] = [
  { slug: "millau", name: "Millau", city: "Millau", countryCode: "FR", department: "Aveyron" },
];

export function findSeoCity(slug: string): SeoCity | undefined {
  return SEO_CITIES.find((c) => c.slug === slug);
}

export function cityPath(city: Pick<SeoCity, "slug">): string {
  return `/aires-de-jeux/${city.slug}/`;
}

export const HUB_PATH = "/aires-de-jeux/";
