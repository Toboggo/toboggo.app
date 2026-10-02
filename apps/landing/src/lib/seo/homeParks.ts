/**
 * Cartes de la section « Des parcs près de chez vous » de la home.
 *
 * Source principale : les parcs DOCUMENTÉS de la ville pilote, lus depuis
 * Supabase au build (même chargement que /aires-de-jeux/<ville>/ : la home et
 * la page de ville restent cohérentes et se mettent à jour au prochain build).
 *
 * Filet de sécurité : sans variables PUBLIC_SUPABASE_* au build, on retombe sur
 * l'instantané statique data/demoParks.ts (parcs réels, figés). À retirer
 * quand les variables sont confirmées sur Vercel.
 *
 * Aucune photo : `image` n'est jamais renseigné ici (droits non établis).
 */
import { DEMO_PARKS } from "../../data/demoParks";
import { cityPath, SEO_CITIES } from "./cities";
import { loadCities, type CityPageData } from "./cityPage";
import { ageLabel, describePark, iconsFor, type SeoPark } from "./parks";

export interface HomeParkCard {
  name: string;
  ageLabel: string | null;
  /** Libellés affichés (3 premiers sur la carte). */
  features: string[];
  /** Ids du sprite pour l'habillage sans photo. */
  icons: string[];
  image?: string;
  imageAlt?: string;
}

export interface HomeParks {
  cards: HomeParkCard[];
  /** Présent seulement si la page de ville est générée ET indexable. */
  cityLink: { href: string; label: string } | null;
  cityName: string;
  source: "supabase" | "snapshot";
}

export const HOME_MAX_CARDS = 6;

export function toCard(park: SeoPark): HomeParkCard {
  const d = describePark(park);
  return {
    name: park.name,
    ageLabel: ageLabel(park),
    features: [...d.equipment, ...d.services, ...d.accessibility, ...d.environment],
    icons: iconsFor(park),
  };
}

/** Les mieux renseignés d'abord (nombre d'infos déclarées), puis ordre alphabétique stable. */
export function pickHomeCards(data: CityPageData, max = HOME_MAX_CARDS): HomeParkCard[] {
  return [...data.documented]
    .sort((a, b) => describePark(b).declaredCount - describePark(a).declaredCount || a.name.localeCompare(b.name, "fr"))
    .slice(0, max)
    .map(toCard);
}

export function snapshotCards(): HomeParkCard[] {
  return DEMO_PARKS.map((p) => ({ name: p.name, ageLabel: p.ageLabel ?? null, features: p.features, icons: [], image: p.image, imageAlt: p.imageAlt }));
}

export async function getHomeParks(env: Record<string, string | undefined>): Promise<HomeParks> {
  const pilot = SEO_CITIES[0];
  const cities = await loadCities(env);
  const data = cities?.find((c) => c.city.slug === pilot.slug);
  if (!data || data.documented.length === 0) {
    return { cards: snapshotCards(), cityLink: null, cityName: pilot.name, source: "snapshot" };
  }
  const plural = data.listed.length > 1;
  return {
    cards: pickHomeCards(data),
    cityLink: data.eligibility.eligible
      ? { href: cityPath(data.city), label: `Voir les ${data.listed.length} ${plural ? "aires de jeux" : "aire de jeux"} à ${data.city.name}` }
      : null,
    cityName: data.city.name,
    source: "supabase",
  };
}
