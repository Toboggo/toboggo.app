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
): Promise<GeoPlace[]> {
  const key = maptilerKey();
  if (!key) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lang = toGeocodeLanguage(language);
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(trimmed)}.json?key=${key}&language=${lang}&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    console.warn(`[geocode] MapTiler a répondu ${res.status}`);
    return [];
  }
  const data = (await res.json()) as MapTilerResponse;
  return (data.features ?? []).map((f) => ({
    id: f.id,
    name: f.text,
    label: f.place_name,
    lng: f.center[0],
    lat: f.center[1],
    bbox: f.bbox,
  }));
}
