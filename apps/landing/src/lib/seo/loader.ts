/**
 * Chargeur Supabase UNIQUE (lecture seule) pour les pages SEO.
 *
 *  - GET uniquement, clé anon publique (RLS), aucune écriture ;
 *  - pagination PostgREST OBLIGATOIRE via `Range` + `Prefer: count=exact` : le
 *    serveur plafonne à 1 000 lignes par réponse SANS erreur (constaté :
 *    `limit=3000` renvoie 1 000 lignes) ;
 *  - toute troncature ou incohérence FAIT ÉCHOUER le build : mieux vaut un
 *    build rouge qu'un site publié avec des données partielles.
 */
import type { RawFeature, SeoPark } from "./parks";

export interface SupabaseReadConfig {
  url: string;
  anonKey: string;
}

/** `null` si la configuration est absente ou invalide (aucune page de ville n'est alors générée). */
export function readConfig(env: Record<string, string | undefined>): SupabaseReadConfig | null {
  const url = (env.PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (env.PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return /^https?:\/\//.test(url) && anonKey ? { url, anonKey } : null;
}

export const PAGE_SIZE = 1000;
/** Garde-fou contre une boucle infinie (500 pages × 1 000 lignes = 500 000 lignes). */
const MAX_REQUESTS = 500;

export class SeoLoadError extends Error {
  constructor(message: string) {
    super(`[seo] ${message}`);
    this.name = "SeoLoadError";
  }
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
  requests: number;
}

export interface FetchAllOptions {
  label: string;
  pageSize?: number;
  /** Nombre de lignes minimal attendu : en dessous, la réponse est jugée suspecte (RLS cassée, API vide…). */
  minRows?: number;
  /** Nombre de lignes maximal plausible. */
  maxRows?: number;
  fetchImpl?: typeof fetch;
}

/** « 0-999/2202 », « 2000-2201/2202 » ou « * /0 » (vide). */
export function parseContentRange(header: string | null): { start: number; end: number; total: number } | null {
  if (!header) return null;
  const match = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(header.trim());
  if (!match) return null;
  const total = Number(match[3]);
  return match[1] === undefined ? { start: 0, end: -1, total } : { start: Number(match[1]), end: Number(match[2]), total };
}

/** Récupère TOUTES les lignes d'une requête PostgREST (la requête doit contenir un `order=` stable). */
export async function fetchAllRows<T>(config: SupabaseReadConfig, path: string, options: FetchAllOptions): Promise<PagedResult<T>> {
  const { label, pageSize = PAGE_SIZE, minRows = 0, maxRows = 500_000, fetchImpl = fetch } = options;
  if (!/[?&]order=/.test(path)) throw new SeoLoadError(`${label} : la requête doit avoir un order= stable pour paginer`);

  const rows: T[] = [];
  let total: number | null = null;
  let start = 0;
  let requests = 0;

  for (;;) {
    if (++requests > MAX_REQUESTS) throw new SeoLoadError(`${label} : plus de ${MAX_REQUESTS} requêtes, abandon`);
    let res: Response;
    try {
      res = await fetchImpl(`${config.url}/rest/v1/${path}`, {
        method: "GET",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
          Accept: "application/json",
          "Range-Unit": "items",
          Range: `${start}-${start + pageSize - 1}`,
          Prefer: "count=exact",
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new SeoLoadError(`${label} : API injoignable ou trop lente (${error instanceof Error ? error.message : String(error)})`);
    }
    if (res.status !== 200 && res.status !== 206) throw new SeoLoadError(`${label} : HTTP ${res.status}`);

    const range = parseContentRange(res.headers.get("content-range"));
    if (!range) throw new SeoLoadError(`${label} : en-tête content-range absent ou illisible (« ${res.headers.get("content-range")} »)`);
    if (total === null) total = range.total;
    else if (range.total !== total) throw new SeoLoadError(`${label} : le total a changé pendant le chargement (${total} → ${range.total}) — relancer le build`);

    let page: unknown;
    try {
      page = await res.json();
    } catch {
      throw new SeoLoadError(`${label} : réponse JSON invalide (HTTP ${res.status})`);
    }
    if (!Array.isArray(page)) throw new SeoLoadError(`${label} : réponse inattendue (tableau attendu)`);

    if (total === 0) break;
    if (range.start !== start) throw new SeoLoadError(`${label} : page décalée (attendu ${start}, reçu ${range.start})`);
    const expected = range.end - range.start + 1;
    if (page.length !== expected) throw new SeoLoadError(`${label} : page tronquée (${page.length} lignes reçues, ${expected} annoncées)`);
    if (page.length === 0) throw new SeoLoadError(`${label} : page vide avant la fin (${rows.length}/${total})`);

    rows.push(...(page as T[]));
    start += page.length;
    if (start >= total) break;
  }

  if (rows.length !== total) throw new SeoLoadError(`${label} : ${rows.length} lignes reçues pour ${total} annoncées`);
  if (total < minRows) throw new SeoLoadError(`${label} : ${total} lignes, moins que le minimum attendu (${minRows})`);
  if (total > maxRows) throw new SeoLoadError(`${label} : ${total} lignes, plus que le maximum plausible (${maxRows})`);
  return { rows, total, requests };
}

// ---------------------------------------------------------------------------

const PARK_COLUMNS = [
  "id",
  "name",
  "slug",
  "city",
  "admin_area_2",
  "postal_code",
  "address_line",
  "latitude",
  "longitude",
  "min_age",
  "max_age",
  "features",
  "verification_status",
  "last_verified_at",
].join(",");

export const PARKS_PATH = `park_public?${new URLSearchParams({
  select: PARK_COLUMNS,
  country_code: "eq.FR",
  moderation_status: "eq.published",
  operational_status: "eq.active",
  order: "id.asc",
}).toString()}`;

/** Liens parc ↔ organisation vérifiés (organization_parks.verified). */
export const VERIFIED_LINKS_PATH = `organization_parks?${new URLSearchParams({
  select: "park_id,organization_id",
  verified: "eq.true",
  order: "park_id.asc,organization_id.asc",
}).toString()}`;

/** Collectivités vérifiées (organizations.verified, type municipality). */
export const VERIFIED_ORGS_PATH = `organizations?${new URLSearchParams({
  select: "id",
  verified: "eq.true",
  type: "eq.municipality",
  order: "id.asc",
}).toString()}`;

interface ParkRow {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  admin_area_2: string | null;
  postal_code: string | null;
  address_line: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  min_age: number | null;
  max_age: number | null;
  features: Record<string, RawFeature> | null;
  verification_status: string | null;
  last_verified_at: string | null;
}

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapRow(row: ParkRow, verifiedParkIds: ReadonlySet<string> = new Set()): SeoPark {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    adminArea2: row.admin_area_2,
    postalCode: row.postal_code,
    addressLine: row.address_line,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    minAge: row.min_age,
    maxAge: row.max_age,
    features: row.features ?? {},
    slug: row.slug,
    verificationStatus: row.verification_status,
    lastVerifiedAt: row.last_verified_at,
    collectivityVerified: verifiedParkIds.has(row.id),
    // Aucune photo n'est lue en 2A : le modèle de droits n'existe pas encore.
    photos: [],
  };
}

export interface SeoSnapshot {
  fetchedAt: string;
  parks: SeoPark[];
  stats: { parkRows: number; verifiedLinks: number; verifiedOrgs: number; requests: number };
}

/** Tout ce dont les pages SEO ont besoin, en 3 lectures paginées. */
export async function fetchSnapshot(
  config: SupabaseReadConfig,
  options: { fetchImpl?: typeof fetch; minParks?: number } = {},
): Promise<SeoSnapshot> {
  const { fetchImpl, minParks = 100 } = options;
  const parks = await fetchAllRows<ParkRow>(config, PARKS_PATH, { label: "park_public", minRows: minParks, fetchImpl });
  const links = await fetchAllRows<{ park_id: string; organization_id: string }>(config, VERIFIED_LINKS_PATH, { label: "organization_parks", fetchImpl });
  const orgs = await fetchAllRows<{ id: string }>(config, VERIFIED_ORGS_PATH, { label: "organizations", fetchImpl });

  const orgIds = new Set(orgs.rows.map((o) => o.id));
  const verifiedParkIds = new Set(links.rows.filter((l) => orgIds.has(l.organization_id)).map((l) => l.park_id));

  const ids = new Set<string>();
  for (const row of parks.rows) {
    if (ids.has(row.id)) throw new SeoLoadError(`park_public : identifiant en double (${row.id}) — pagination incohérente`);
    ids.add(row.id);
  }

  return {
    fetchedAt: new Date().toISOString(),
    parks: parks.rows.map((row) => mapRow(row, verifiedParkIds)),
    stats: { parkRows: parks.total, verifiedLinks: links.total, verifiedOrgs: orgs.total, requests: parks.requests + links.requests + orgs.requests },
  };
}
