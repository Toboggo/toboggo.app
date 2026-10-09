/// <reference path="../tz-lookup.d.ts" />
/**
 * Pays + fuseau horaire d'un parc créé depuis les coordonnées — jamais un
 * défaut « France » silencieux.
 *
 * Ordre de résolution :
 *   - `timezone` : valeur fournie, sinon fuseau IANA déduit des COORDONNÉES
 *     (base `tz-lookup`, hors ligne, chargée à la demande — un seul fuseau par
 *     région ne suffit pas aux États multi-fuseaux) ;
 *   - `country_code` : valeur fournie (ISO 3166-1 alpha-2, p. ex. issue du
 *     reverse geocoding), sinon déduit du fuseau pour les seuls marchés
 *     connus (France, Espagne, États-Unis). Tout autre cas lève
 *     `ParkLocaleError` : l'appelant doit l'afficher, pas inventer un pays.
 */

export type ParkLocaleReason = "invalid_coordinates" | "timezone_unresolved" | "country_unresolved";

export class ParkLocaleError extends Error {
  constructor(
    public readonly reason: ParkLocaleReason,
    message: string,
  ) {
    super(message);
    this.name = "ParkLocaleError";
  }
}

export interface ParkLocale {
  country_code: string;
  timezone: string;
}

const US_TIMEZONE =
  /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Juneau|Sitka|Nome|Yakutat|Metlakatla|Adak|Detroit|Boise|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu)$/;
// France métropolitaine + outre-mer (jusqu'ici tous rattachés à « FR » par défaut).
const FR_TIMEZONES = new Set([
  "Europe/Paris",
  "Indian/Reunion",
  "Indian/Mayotte",
  "America/Martinique",
  "America/Guadeloupe",
  "America/Cayenne",
  "America/Miquelon",
  "Pacific/Tahiti",
  "Pacific/Marquesas",
  "Pacific/Gambier",
  "Pacific/Noumea",
  "Pacific/Wallis",
  "Indian/Kerguelen",
]);
const ES_TIMEZONES = new Set(["Europe/Madrid", "Atlantic/Canary", "Africa/Ceuta"]);

/** Pays déduit d'un fuseau IANA pour les marchés connus, sinon `null`. */
export function countryFromTimezone(timezone: string): string | null {
  if (US_TIMEZONE.test(timezone)) return "US";
  if (FR_TIMEZONES.has(timezone)) return "FR";
  if (ES_TIMEZONES.has(timezone)) return "ES";
  return null;
}

/** Libellé technique stocké dans `parks.name` (NOT NULL) quand aucun nom n'est
 * fourni. Même règle que `placeholder_name` des imports OSM
 * (`scripts/osm/regions.json`) ; l'app n'affiche jamais cette valeur brute
 * (`getParkDisplayName` la reconnaît comme générique et la localise). */
export function genericParkNameForCountry(countryCode: string | null | undefined): string {
  return countryCode?.toUpperCase() === "US" ? "Playground" : "Aire de jeux";
}

async function lookupTimezone(lat: number, lng: number): Promise<string> {
  try {
    const mod = (await import("tz-lookup")) as unknown as { default?: TzLookup } & TzLookup;
    const fn: TzLookup = typeof mod.default === "function" ? mod.default : mod;
    const tz = fn(lat, lng);
    if (tz) return tz;
  } catch {
    /* coordonnées hors plage ou base indisponible : traité ci-dessous */
  }
  throw new ParkLocaleError("timezone_unresolved", `Fuseau horaire introuvable pour (${lat}, ${lng})`);
}
type TzLookup = (lat: number, lng: number) => string;

export async function resolveParkLocale(
  lat: number,
  lng: number,
  provided: { country_code?: string | null; timezone?: string | null } = {},
): Promise<ParkLocale> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ParkLocaleError("invalid_coordinates", `Coordonnées invalides (${lat}, ${lng})`);
  }
  const timezone = provided.timezone?.trim() || (await lookupTimezone(lat, lng));

  const rawCountry = provided.country_code?.trim().toUpperCase();
  if (rawCountry && /^[A-Z]{2}$/.test(rawCountry)) return { country_code: rawCountry, timezone };

  const inferred = countryFromTimezone(timezone);
  if (!inferred) {
    throw new ParkLocaleError("country_unresolved", `Pays introuvable pour (${lat}, ${lng}) [${timezone}]`);
  }
  return { country_code: inferred, timezone };
}
