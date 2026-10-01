/**
 * Géocodage — MapTiler Geocoding, provider-agnostic côté appelant.
 *
 * Sert uniquement à transformer une saisie libre (ville, adresse, quartier…)
 * en coordonnées géographiques. Ne renvoie jamais de parc : la base Toboggo
 * (`park_public` / RPC `nearby_parks`) reste l'unique source des parcs.
 *
 * Configuré via `VITE_MAPTILER_KEY`. Absente ⇒ `searchPlaces` renvoie un
 * tableau vide sans appel réseau. La clé n'est jamais loguée ni renvoyée.
 */

export interface GeoPlace {
  id: string;
  /** Nom court du lieu (ex. "New York"). */
  name: string;
  /** Libellé complet pour affichage secondaire (ex. "New York, NY, États-Unis"). */
  label: string;
  /**
   * Contexte géographique secondaire quand le fournisseur le donne (ex.
   * "Catalogne, Espagne" — les 2 niveaux administratifs les plus larges de
   * `context`, jamais déduits). Absent pour une adresse / un quartier / un
   * point d'intérêt, ou si le fournisseur ne renvoie rien d'exploitable : l'UI
   * retombe alors sur `label`.
   */
  context?: string;
  /** Types de lieu MapTiler (`place_type`), pour choisir un cadrage adapté. */
  placeType?: string[];
  lat: number;
  lng: number;
  bbox?: [number, number, number, number];
}

function maptilerKey(): string | null {
  const raw = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * `true` quand `VITE_MAPTILER_KEY` est renseignée — la recherche de lieux est
 * alors opérationnelle. Sinon `searchPlaces` renvoie toujours `[]` sans appel
 * réseau : l'UI doit masquer / désactiver la recherche plutôt que d'afficher
 * un champ mort. (Miroir de `isSupabaseConfigured` dans `supabaseClient.ts`.)
 */
export function isGeocodingConfigured(): boolean {
  return maptilerKey() !== null;
}

interface MapTilerFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  bbox?: [number, number, number, number];
  place_type?: string[];
  /** Du plus fin au plus large (commune → département → région → pays). */
  context?: { id?: string; text?: string }[];
}

interface MapTilerResponse {
  features?: MapTilerFeature[];
}

/** Langues d'affichage supportées pour les libellés de lieux renvoyés par
 * MapTiler. Sert uniquement à demander les libellés dans la langue de l'UI —
 * ne restreint jamais la zone de recherche et ne dépend pas du pays. */
type GeocodeLanguage = "fr" | "es" | "en";
function toGeocodeLanguage(value: string | null | undefined): GeocodeLanguage {
  const primary = (value ?? "").toLowerCase().split(/[-_]/)[0];
  return primary === "es" || primary === "en" ? primary : "fr";
}

// Types pour lesquels « région, pays » serait un contexte trompeur (on perdrait
// la ville) : ils gardent le libellé complet du fournisseur.
const PRECISE_PLACE_TYPES = new Set(["address", "poi", "street", "neighbourhood", "postal_code"]);

function buildContext(name: string, f: MapTilerFeature): string | undefined {
  if (f.place_type?.some((t) => PRECISE_PLACE_TYPES.has(t))) return undefined;
  const texts = (f.context ?? []).map((c) => c.text?.trim()).filter((t): t is string => !!t);
  const distinct = texts.filter((t, i) => t !== name && texts.indexOf(t) === i);
  return distinct.length ? distinct.slice(-2).join(", ") : undefined;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `name` correspond-il EXACTEMENT à la saisie (insensible à la casse, aux
 * accents et aux espaces superflus) ? Rang 0 de `rankPlaces` ; sert aussi à
 * décider si un lieu ou un parc « est » ce que l'utilisateur a tapé.
 */
export function isExactNameMatch(query: string, name: string): boolean {
  const q = normalizeForMatch(query);
  return q !== "" && normalizeForMatch(name) === q;
}

/**
 * Classe les lieux d'une recherche pour une validation « Entrée » : nom exact
 * (insensible à la casse et aux accents), puis nom commençant par la saisie,
 * puis nom la contenant, puis le reste. À rang égal, l'ordre du fournisseur est
 * conservé (tri stable). Règle générique, sans cas particulier par ville.
 */
export function rankPlaces(query: string, places: GeoPlace[]): GeoPlace[] {
  const q = normalizeForMatch(query);
  if (!q) return places;
  const tier = (p: GeoPlace) => {
    const n = normalizeForMatch(p.name);
    return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3;
  };
  return places
    .map((place, index) => ({ place, index, tier: tier(place) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((e) => e.place);
}

/**
 * Recherche un lieu par texte libre via MapTiler Geocoding. `signal` permet à
 * l'appelant (React Query) d'annuler une requête devenue obsolète pendant une
 * saisie rapide — les annulations remontent comme un rejet standard, sans
 * repasser par le tableau vide ci-dessous.
 *
 * `language` : langue des libellés renvoyés (celle de l'UI). N'influe pas sur
 * la logique de recherche ni sur la zone couverte. Les noms officiels de
 * communes / adresses restent ceux fournis par le fournisseur, non retraduits.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  language?: string,
  options?: { throwOnError?: boolean },
): Promise<GeoPlace[]> {
  const key = maptilerKey();
  if (!key) {
    if (options?.throwOnError) throw new Error("Geocoding not configured");
    return [];
  }
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lang = toGeocodeLanguage(language);
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(trimmed)}.json?key=${key}&language=${lang}&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    console.warn(`[geocode] MapTiler a répondu ${res.status}`);
    // `throwOnError` : l'appelant veut distinguer « erreur » de « aucun lieu »
    // (recherche Explorer). Par défaut, comportement historique : `[]`.
    if (options?.throwOnError) throw new Error(`MapTiler ${res.status}`);
    return [];
  }
  const data = (await res.json()) as MapTilerResponse;
  return (data.features ?? []).map((f) => ({
    id: f.id,
    name: f.text,
    label: f.place_name,
    context: buildContext(f.text, f),
    placeType: f.place_type,
    lng: f.center[0],
    lat: f.center[1],
    bbox: f.bbox,
  }));
}
