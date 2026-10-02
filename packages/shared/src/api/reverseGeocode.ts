import { getSupabase } from "../supabaseClient";
import { isValidCoordinate } from "./parks";

/**
 * Adresse structurée issue du reverse geocoding Geoapify. Mêmes noms que les
 * colonnes `parks` (address_line, postal_code, city, admin_area_1/2,
 * country_code) pour être écrite telle quelle à la création.
 */
export interface ReverseGeocodedAddress {
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  admin_area_1: string | null;
  admin_area_2: string | null;
  country_code: string | null;
  formatted: string | null;
}

/**
 * Coordonnées → adresse structurée, via l'Edge Function `reverse-geocode`
 * (supabase/functions/reverse-geocode) : la clé Geoapify reste côté serveur.
 *
 * Aucune langue n'est transmise : la donnée persistée (ville, régions…) ne doit
 * pas dépendre de la langue de l'interface, comme dans le pipeline OSM
 * (`scripts/osm/geoapify.py`).
 *
 * Opération d'ENRICHISSEMENT à l'entrée/modification d'une donnée — ne jamais
 * l'appeler pour afficher un parc existant (l'adresse est persistée).
 *
 * Retourne `null` si Geoapify n'a rien d'exploitable ; coordonnées invalides →
 * `null` sans aucun appel réseau. Toute erreur (réseau, serveur, abandon via
 * `signal`) est propagée : l'appelant décide de conserver l'adresse existante.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  options?: { signal?: AbortSignal },
): Promise<ReverseGeocodedAddress | null> {
  if (!isValidCoordinate(lat, lng)) return null;
  const { data, error } = await getSupabase().functions.invoke<{ address: ReverseGeocodedAddress | null }>(
    "reverse-geocode",
    { body: { lat, lng }, signal: options?.signal },
  );
  if (error) throw error;
  return data?.address ?? null;
}
