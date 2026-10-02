// Logique pure (aucune API Deno) du reverse geocoding Geoapify, testable sous
// Vitest. Miroir EXACT de `scripts/osm/geoapify.py::_extract` (même règle de
// composition, mêmes champs, même règle de rejet), plus `country_code`. Un test
// de parité (`parity.test.ts`) exécute les deux sur les mêmes fixtures : ne pas
// diverger sans mettre à jour le pipeline OSM.

export interface StructuredAddress {
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  admin_area_1: string | null;
  admin_area_2: string | null;
  country_code: string | null;
  formatted: string | null;
}

// Équivalent de la « truthiness » Python sur une chaîne : non vide, sans trim
// (le pipeline OSM ne trim pas non plus).
function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** Coordonnées WGS84 valides (hors « Null Island »), sinon `null`. Seules `lat`
 * et `lng` sont lues : aucun autre champ du corps n'a d'effet. */
export function parseCoordinates(body: unknown): { lat: number; lng: number } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { lat, lng } = body as { lat?: unknown; lng?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Premier résultat Geoapify → adresse structurée, ou `null` si inexploitable
 * (aucun de address_line / postal_code / city). */
export function extractAddress(data: unknown): StructuredAddress | null {
  const results = (data as { results?: unknown } | null)?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const r = results[0] as Record<string, unknown>;

  const housenumber = str(r.housenumber);
  const street = str(r.street);
  const address_line = housenumber && street ? `${housenumber} ${street}` : street ?? str(r.address_line1);

  const result: StructuredAddress = {
    address_line,
    postal_code: str(r.postcode),
    city: str(r.city) ?? str(r.town) ?? str(r.village),
    admin_area_1: str(r.state),
    admin_area_2: str(r.county) ?? str(r.state_district),
    country_code: str(r.country_code)?.toUpperCase() ?? null,
    formatted: str(r.formatted),
  };
  if (!result.address_line && !result.postal_code && !result.city) return null;
  return result;
}
