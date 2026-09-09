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

/**
 * Recherche un lieu par texte libre via MapTiler Geocoding. `signal` permet à
 * l'appelant (React Query) d'annuler une requête devenue obsolète pendant une
 * saisie rapide — les annulations remontent comme un rejet standard, sans
 * repasser par le tableau vide ci-dessous.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const key = maptilerKey();
  if (!key) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(trimmed)}.json?key=${key}&language=fr&limit=5`;
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
