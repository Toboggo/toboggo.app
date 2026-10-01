/**
 * Lecture SEULE des parcs publiés via PostgREST (clé anon publique, RLS :
 * `parks_public_read`). Uniquement des requêtes GET — jamais d'écriture.
 * Aucun SDK : un simple fetch suffit au build.
 *
 * Config : PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY (voir .env.example).
 * La clé n'est jamais loguée.
 */
import type { SeoCity } from "./cities";
import type { RawFeature, SeoPark } from "./parks";

export interface SupabaseReadConfig {
  url: string;
  anonKey: string;
}

/** `null` si la configuration est absente ou invalide (la page n'est alors pas générée). */
export function readConfig(env: Record<string, string | undefined>): SupabaseReadConfig | null {
  const url = (env.PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (env.PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return /^https?:\/\//.test(url) && anonKey ? { url, anonKey } : null;
}

const COLUMNS = [
  "name",
  "city",
  "postal_code",
  "address_line",
  "latitude",
  "longitude",
  "min_age",
  "max_age",
  "features",
].join(",");

interface ParkRow {
  name: string;
  city: string | null;
  postal_code: string | null;
  address_line: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  min_age: number | null;
  max_age: number | null;
  features: Record<string, RawFeature> | null;
}

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapRow(row: ParkRow): SeoPark {
  return {
    name: row.name,
    city: row.city,
    postalCode: row.postal_code,
    addressLine: row.address_line,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    minAge: row.min_age,
    maxAge: row.max_age,
    features: row.features ?? {},
  };
}

/** Parcs `published` ET `active` d'une ville (filtre réel du schéma V2). */
export function buildParksQuery(city: SeoCity): string {
  const params = new URLSearchParams({
    select: COLUMNS,
    country_code: `eq.${city.countryCode}`,
    city: `eq.${city.city}`,
    moderation_status: "eq.published",
    operational_status: "eq.active",
    order: "name.asc,address_line.asc",
    limit: "1000",
  });
  return params.toString();
}

export async function fetchCityParks(config: SupabaseReadConfig, city: SeoCity, fetchImpl: typeof fetch = fetch): Promise<SeoPark[]> {
  const res = await fetchImpl(`${config.url}/rest/v1/park_public?${buildParksQuery(city)}`, {
    method: "GET",
    headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Supabase read failed for ${city.slug}: HTTP ${res.status}`);
  const rows = (await res.json()) as ParkRow[];
  if (!Array.isArray(rows)) throw new Error(`Supabase read for ${city.slug}: unexpected payload`);
  return rows.map(mapRow);
}
