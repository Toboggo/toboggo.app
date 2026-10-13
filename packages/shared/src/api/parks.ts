import { getSupabase } from "../supabaseClient";
import { resolveParkLocale } from "../utils/parkLocale";
import type {
  FeatureCategory,
  FeatureStatus,
  Park,
  ParkEditHistoryEntry,
  ParkFeatureView,
  ParkStatus,
  SourceType,
  VerificationStatus,
} from "../types";
import type { Database, Json, TablesInsert, TablesUpdate } from "../types/database.types";

// Columns to pull from the `park_public` view — everything except the PostGIS
// geography blobs (`location`, `boundary`) which the app never reads.
const PARK_COLS =
  "id,name,slug,description,latitude,longitude,lat,lng,country_code,timezone," +
  "address_line,postal_code,city,admin_area_1,admin_area_2," +
  "min_age,max_age,ages_derived,moderation_status,operational_status," +
  "status_reason,status_from,status_until,verification_status,created_by," +
  "rating,review_count,has_open_report,views,created_at,updated_at,last_verified_at," +
  "features,cover_photo,photos,translated_names,score,has_score," +
  "age_min,age_max,status,formatted_address,commune_id,organization_id," +
  "wc,shade,fenced,pmr,benches,water,parking,surface,play_equipment";

export interface NearbyParksParams {
  lat: number;
  lng: number;
  radiusMeters?: number;
  ageMin?: number;
  ageMax?: number;
  amenities?: Partial<Record<"wc" | "shade" | "fenced" | "pmr" | "benches" | "water" | "parking", boolean>>;
  /** Codes de jeux (catalogue `features`, catégorie `play`) — TOUS requis (ET). Vide/absent = pas de restriction. */
  games?: readonly string[];
}

/** One row of the PostGIS `nearby_parks` RPC — a flat projection, narrower than `Park`. */
type NearbyParkRow = Database["public"]["Functions"]["nearby_parks"]["Returns"][number];

const AMENITY_KEYS = ["wc", "shade", "fenced", "pmr", "benches", "water", "parking"] as const;

/** Codes V1 de `park.play_equipment` → code catalogue V2 (lecture seule). */
const LEGACY_PLAY_ALIASES: Record<string, string> = {
  toboggan: "slide",
  springs: "springer",
  waterplay: "water_play",
  motorcourse: "motor_course",
};

/**
 * Le parc a-t-il ce jeu ? Présence POSITIVE uniquement : `features[code].status
 * === "available"` ou code (V1 normalisé) dans `play_equipment`. Une donnée
 * absente / `unknown` / `unavailable` n'est jamais comptée comme présente.
 */
export function parkHasGame(p: Pick<Park, "features" | "play_equipment">, code: string): boolean {
  if (p.features?.[code]?.status === "available") return true;
  return (p.play_equipment ?? []).some((c) => (LEGACY_PLAY_ALIASES[c] ?? c) === code);
}

/** Filtre client des parcs déjà ramenés par `nearby_parks` (âge ∩ services ∩ jeux, tous en ET). */
export function filterNearbyParks<T extends Park>(rows: T[], params: NearbyParksParams): T[] {
  let out = rows;
  if (params.ageMin != null) out = out.filter((p) => (p.age_max ?? p.max_age ?? 99) >= params.ageMin!);
  if (params.ageMax != null) out = out.filter((p) => (p.age_min ?? p.min_age ?? 0) <= params.ageMax!);
  if (params.amenities) {
    for (const key of AMENITY_KEYS) {
      if (params.amenities[key]) out = out.filter((p) => p[key] === true);
    }
  }
  for (const code of params.games ?? []) out = out.filter((p) => parkHasGame(p, code));
  return out;
}

/** The RPC/view `features` column is `jsonb`; read it entry-by-entry into the
 * typed `ParkFeatureView` shape (no blanket cast — every field is validated). */
function asFeatureMap(value: NearbyParkRow["features"]): Record<string, ParkFeatureView> {
  const out: Record<string, ParkFeatureView> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [code, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const f: { [k: string]: Json | undefined } = raw;
    out[code] = {
      status: (f.status as FeatureStatus | undefined) ?? "unknown",
      value: typeof f.value === "string" ? f.value : null,
      quantity: typeof f.quantity === "number" ? f.quantity : null,
      category: (f.category as FeatureCategory | undefined) ?? "service",
      verified_at: typeof f.verified_at === "string" ? f.verified_at : null,
    };
  }
  return out;
}

/** Map the RPC projection onto the full `Park` shape. Fields the RPC does not
 * return are absent at runtime too, so they take their canonical empty value. */
function nearbyRowToPark(row: NearbyParkRow): Park & { distance_m: number } {
  return {
    ...row,
    surface: row.surface as Park["surface"],
    features: asFeatureMap(row.features),
    slug: null,
    boundary: null,
    postal_code: null,
    admin_area_1: null,
    admin_area_2: null,
    ages_derived: false,
    status_reason: null,
    status_from: null,
    status_until: null,
    last_verified_at: null,
    translated_names: [],
    has_score: row.score != null,
  };
}

/** Taille d'une page de `nearby_parks`. = `max_rows` PostgREST (1 000, défaut
 * Supabase et `supabase/config.toml`) : au-delà, la réponse est tronquée en
 * silence — et comme la fonction trie par distance, ce sont les parcs les plus
 * lointains du rayon qui disparaissent (Manhattan : 1 483 parcs à 20 km, le
 * 1 000ᵉ est à 13,6 km). */
export const NEARBY_PAGE_SIZE = 1000;
/** Garde-fou : 8 pages = 8 000 parcs maximum dans un rayon (très au-delà de la
 * zone la plus dense observée). */
export const NEARBY_MAX_PAGES = 8;

/** PostGIS `nearby_parks` RPC — real geospatial "near me". Returns the flat
 * compatibility shape plus the normalised `features` map.
 *
 * Pagine `.range()` sur la fonction (triée par distance) jusqu'à épuisement du
 * rayon demandé ; le rayon n'est jamais réduit. Dédoublonné par `id` (un parc
 * ne peut apparaître deux fois si l'ordre bouge entre deux pages). Une page
 * non pleine signe la dernière : zones peu denses = un seul appel, comme avant. */
export async function fetchNearbyParks(params: NearbyParksParams): Promise<(Park & { distance_m: number })[]> {
  const supabase = getSupabase();
  const rows: Parameters<typeof nearbyRowToPark>[0][] = [];
  const seen = new Set<string>();
  for (let page = 0; page < NEARBY_MAX_PAGES; page++) {
    const from = page * NEARBY_PAGE_SIZE;
    const { data, error } = await supabase
      .rpc("nearby_parks", {
        p_lat: params.lat,
        p_lng: params.lng,
        p_radius_m: params.radiusMeters ?? 20000,
      })
      .range(from, from + NEARBY_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const row of batch) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    if (batch.length < NEARBY_PAGE_SIZE) break;
    if (page === NEARBY_MAX_PAGES - 1) {
      // Plafond atteint avec une page encore pleine : le rayon n'est pas
      // épuisé. Jamais de troncature silencieuse — on l'écrit, avec la
      // distance jusqu'à laquelle le résultat est complet (tri par distance).
      const lastRow = batch[batch.length - 1] as { distance_m?: number };
      console.warn(
        `[nearby_parks] plafond de ${NEARBY_MAX_PAGES} pages atteint : résultat complet jusqu'à ` +
          `${Math.round(lastRow.distance_m ?? 0)} m seulement (rayon demandé : ${params.radiusMeters ?? 20000} m).`,
      );
    }
  }
  return filterNearbyParks(rows.map(nearbyRowToPark), params);
}

export async function searchParks(query: string): Promise<Park[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_public")
    .select(PARK_COLS)
    .eq("moderation_status", "published")
    .or(`name.ilike.%${query}%,city.ilike.%${query}%,address_line.ilike.%${query}%`)
    .limit(20);
  if (error) throw error;
  return data as unknown as Park[];
}

export async function listMyParks(userId: string): Promise<Park[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_public")
    .select(PARK_COLS)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Park[];
}

export async function listParksByIds(ids: string[]): Promise<Park[]> {
  if (!ids.length) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_public").select(PARK_COLS).in("id", ids);
  if (error) throw error;
  return data as unknown as Park[];
}

export async function getPark(id: string): Promise<Park> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_public").select(PARK_COLS).eq("id", id).single();
  if (error) throw error;
  return data as unknown as Park;
}

// ── Lot A — listes bornées, filtres d'organisation côté serveur ──────────
// Principes (voir docs/audit/admin-parks-pagination.md) :
//  • PostgREST plafonne chaque réponse à `max_rows` (1000). Aucune fonction de
//    ce fichier ne suppose « une requête = tout » : tout chargement multiple
//    est séquentiel, par lots ≤ 1000, avec un PLAFOND dur (jamais illimité).
//  • Le périmètre d'une collectivité n'est JAMAIS transmis sous forme d'une
//    liste `id=in.(…)` (URL trop longue au-delà de ~300 parcs, 1000 ids max) :
//    c'est une jointure `organization_parks!inner` filtrée côté serveur. Elle
//    passe par la RLS de l'appelant : aucun accès élargi.

/** Taille de lot alignée sur `max_rows` PostgREST — ne jamais dépasser. */
export const FETCH_BATCH_SIZE = 1000;
/** Plafond d'un chargement complet (`listParks`) : au-delà, résultat tronqué ET signalé. */
export const LIST_PARKS_HARD_CAP = 10_000;
/** Plafond d'un export CSV : au-delà, l'export est refusé (message « affinez les filtres »). */
export const EXPORT_MAX_ROWS = 50_000;
/** Profondeur maximale de la pagination par pages (OFFSET) : au-delà, affiner les filtres. */
export const MAX_DEEP_OFFSET = 10_000;
/** Plafond de sécurité du nombre de pays distincts parcourus. */
const MAX_COUNTRIES = 300;
/** Plafond de sécurité des identifiants d'une organisation (`listOrgParkIds`). */
const ORG_IDS_HARD_CAP = 100_000;
/** Requêtes de comptage simultanées (jamais « tout en parallèle »). */
const COUNT_CONCURRENCY = 4;

/** Exécute `tasks` avec au plus `limit` en vol (ordre des résultats conservé). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Chemin du filtre de périmètre quand la table liée EMBARQUE `parks` (reports, reviews, park_media,
 * park_edits) : `.eq("parks.organization_parks.organization_id", id)` avec le fragment ci-dessous. */
export const ORG_PARK_SCOPE_PATH = "organization_parks.organization_id";

/** Fragment de `select` (à placer DANS l'embed `parks!inner(...)`/`park:parks!inner(...)`) —
 * jointure interne vers `organization_parks`, vide si aucun périmètre. */
export function orgParkScopeSelect(organizationId?: string): string {
  return organizationId ? ", organization_parks!inner(organization_id)" : "";
}

/** `communeId` = périmètre de session ; `organizationId` = filtre « Collectivité » (Admin). */
interface OrgScope {
  communeId?: string;
  organizationId?: string;
}

const SCOPE_ALIAS = { communeId: "scope_c", organizationId: "scope_o" } as const;
const EMBED_KEYS = ["park_sources", "src_filter", "scope_c", "scope_o"] as const;

/** Fragment de `select` : une jointure interne par périmètre actif (alias distincts). */
function orgScopeSelect(scope: OrgScope): string {
  let s = "";
  if (scope.communeId) s += `, ${SCOPE_ALIAS.communeId}:organization_parks!inner(organization_id)`;
  if (scope.organizationId) s += `, ${SCOPE_ALIAS.organizationId}:organization_parks!inner(organization_id)`;
  return s;
}

// `query` est le builder PostgREST : son type générique dépend du `select`
// (chaîne dynamique) — on le manipule via une interface minimale.
interface FilterableQuery {
  eq(column: string, value: string): this;
}

function applyOrgScope<Q extends FilterableQuery>(query: Q, scope: OrgScope): Q {
  let q = query;
  if (scope.communeId) q = q.eq(`${SCOPE_ALIAS.communeId}.organization_id`, scope.communeId);
  if (scope.organizationId) q = q.eq(`${SCOPE_ALIAS.organizationId}.organization_id`, scope.organizationId);
  return q;
}

function stripEmbeds<T extends object>(row: T): Omit<T, (typeof EMBED_KEYS)[number]> {
  const copy = { ...(row as Record<string, unknown>) };
  for (const k of EMBED_KEYS) delete copy[k];
  return copy as never;
}

/**
 * Identifiants des parcs d'une organisation — **paginés** (keyset sur `park_id`,
 * lots de 1000, séquentiels, plafond dur). Conservé pour compatibilité ; les
 * lectures de la collectivité n'en dépendent plus (jointure serveur). Les appels
 * concurrents pour une même organisation partagent une requête en vol.
 */
const inFlightOrgParkIds = new Map<string, Promise<string[]>>();

export function listOrgParkIds(organizationId: string): Promise<string[]> {
  const inFlight = inFlightOrgParkIds.get(organizationId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const supabase = getSupabase();
    const ids: string[] = [];
    let last: string | null = null;
    while (ids.length < ORG_IDS_HARD_CAP) {
      let q = supabase
        .from("organization_parks")
        .select("park_id")
        .eq("organization_id", organizationId)
        .order("park_id", { ascending: true })
        .limit(FETCH_BATCH_SIZE);
      if (last) q = q.gt("park_id", last);
      const { data, error } = await q;
      if (error) throw error;
      const batch = (data ?? []) as { park_id: string }[];
      for (const r of batch) ids.push(r.park_id);
      if (batch.length < FETCH_BATCH_SIZE) break;
      last = batch[batch.length - 1].park_id;
    }
    return ids;
  })();

  const tracked = promise.finally(() => {
    if (inFlightOrgParkIds.get(organizationId) === tracked) inFlightOrgParkIds.delete(organizationId);
  });
  inFlightOrgParkIds.set(organizationId, tracked);
  return tracked;
}

/** Ce parc appartient-il à cette organisation ? Une seule requête sur la clé primaire
 * `(organization_id, park_id)` — remplace `listOrgParkIds(...).includes(id)`. */
export async function isParkInOrganization(organizationId: string, parkId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("organization_parks")
    .select("park_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("park_id", parkId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export interface ListParksResult {
  rows: Park[];
  /** `true` si le plafond (`LIST_PARKS_HARD_CAP`) a été atteint : il existe d'autres parcs. */
  truncated: boolean;
}

/**
 * Chargement complet BORNÉ d'un périmètre : lots de 1000 séquentiels (keyset sur `id`,
 * stable et sans doublon), arrêt au plafond `LIST_PARKS_HARD_CAP` avec `truncated`.
 * Résultat trié `created_at desc, id` (comportement historique de `listParks`).
 */
export async function listParksCapped(
  opts: { communeId?: string; status?: ParkStatus[]; cap?: number } = {},
): Promise<ListParksResult> {
  const supabase = getSupabase();
  const cap = opts.cap ?? LIST_PARKS_HARD_CAP;
  const rows: Park[] = [];
  let last: string | null = null;
  let truncated = false;
  for (;;) {
    // `cap + 1` lignes au total suffisent à savoir s'il en existe davantage.
    const want = Math.min(FETCH_BATCH_SIZE, cap + 1 - rows.length);
    let q = supabase
      .from("park_public")
      .select(`${PARK_COLS}${orgScopeSelect({ communeId: opts.communeId })}`)
      .order("id", { ascending: true })
      .limit(want);
    q = applyOrgScope(q, { communeId: opts.communeId });
    if (opts.status?.length) q = q.in("moderation_status", opts.status);
    if (last) q = q.gt("id", last);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as unknown as (Park & Record<string, unknown>)[];
    for (const r of batch) rows.push(stripEmbeds(r) as unknown as Park);
    if (rows.length > cap) {
      rows.length = cap;
      truncated = true;
      break;
    }
    if (batch.length < want) break;
    last = batch[batch.length - 1].id;
  }
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? -1 : 1));
  return { rows, truncated };
}

/** Voir `listParksCapped` : même résultat sans l'indicateur (un avertissement console si tronqué). */
export async function listParks(opts: { communeId?: string; status?: ParkStatus[] } = {}): Promise<Park[]> {
  const { rows, truncated } = await listParksCapped(opts);
  if (truncated) console.warn(`[listParks] plafond de ${LIST_PARKS_HARD_CAP} parcs atteint : liste tronquée.`);
  return rows;
}

/**
 * Admin-UI-7D-C — exact per-status counts (`count: "exact", head: true`, aucune ligne
 * transférée). `ParkStatus` est un enum fermé : une requête par statut. Le périmètre de
 * collectivité est une jointure serveur (plus de liste d'ids).
 */
export async function getParkStatusCounts(
  statuses: ParkStatus[],
  opts: { communeId?: string } = {},
): Promise<Partial<Record<ParkStatus, number>>> {
  const supabase = getSupabase();
  const entries = await mapWithConcurrency(statuses, COUNT_CONCURRENCY, async (status) => {
    let query = supabase
      .from("park_public")
      .select(`id${orgScopeSelect({ communeId: opts.communeId })}`, { count: "exact", head: true })
      .eq("moderation_status", status);
    query = applyOrgScope(query, { communeId: opts.communeId });
    const { count, error } = await query;
    if (error) throw error;
    return [status, count ?? 0] as const;
  });
  return Object.fromEntries(entries);
}

export interface ParkCountryCount {
  country_code: string;
  count: number;
}

/**
 * Répartition réelle par `country_code`, fiable à toute échelle et **stable** :
 *  1. découverte des pays DISTINCTS par « saut » d'index — une requête par pays
 *     (`order country_code`, `limit 1`, `country_code > dernier`), au lieu de
 *     parcourir tout le catalogue (500 requêtes à 500 000 parcs) ;
 *  2. un `count` exact par pays (4 simultanés au plus).
 * Aucune pagination sans `ORDER BY` : plus de doublons ni de manques possibles.
 * Un pays nouveau apparaît dès qu'un parc l'utilise (aucune liste codée en dur).
 */
export async function getParkCountryDistribution(): Promise<ParkCountryCount[]> {
  const supabase = getSupabase();
  const codes: string[] = [];
  let last: string | null = null;
  while (codes.length < MAX_COUNTRIES) {
    let q = supabase
      .from("park_public")
      .select("country_code")
      .not("country_code", "is", null)
      .order("country_code", { ascending: true })
      .limit(1);
    if (last !== null) q = q.gt("country_code", last);
    const { data, error } = await q;
    if (error) throw error;
    const code = (data as { country_code: string }[] | null)?.[0]?.country_code;
    if (!code) break;
    codes.push(code);
    last = code;
  }
  const counted = await mapWithConcurrency(codes, COUNT_CONCURRENCY, async (country_code) => {
    const { count, error } = await supabase
      .from("park_public")
      .select("id", { count: "exact", head: true })
      .eq("country_code", country_code);
    if (error) throw error;
    return { country_code, count: count ?? 0 };
  });
  return counted
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || (a.country_code < b.country_code ? -1 : 1));
}

/**
 * Parcs créés par des utilisateurs (`created_by` non nul), comptés par créateur : lots
 * keyset de 1000 sur `id`, colonnes `id,created_by` seulement, plafond dur. Remplace
 * `listParks({})` + `.filter(created_by).length` (tronqué à 1000, vue complète).
 * `complete` = `false` si le plafond a été atteint (compteurs alors minorés).
 */
export async function countParksByCreator(
  cap = LIST_PARKS_HARD_CAP,
): Promise<{ counts: Map<string, number>; complete: boolean }> {
  const supabase = getSupabase();
  const counts = new Map<string, number>();
  let seen = 0;
  let last: string | null = null;
  for (;;) {
    let q = supabase
      .from("park_public")
      .select("id,created_by")
      .not("created_by", "is", null)
      .order("id", { ascending: true })
      .limit(FETCH_BATCH_SIZE);
    if (last) q = q.gt("id", last);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as { id: string; created_by: string }[];
    for (const r of batch) counts.set(r.created_by, (counts.get(r.created_by) ?? 0) + 1);
    seen += batch.length;
    if (batch.length < FETCH_BATCH_SIZE) return { counts, complete: true };
    if (seen >= cap) return { counts, complete: false };
    last = batch[batch.length - 1].id;
  }
}

const ILIKE_SPECIALS = /[\\%_]/g;

/**
 * Doublon à l'import CSV : un parc de même nom ET de même adresse existe-t-il dans le
 * périmètre ? Requête ciblée (nom exact, insensible à la casse, via l'index trigramme)
 * au lieu de charger tout le catalogue ; comparaison finale STRICTE sur nom et adresse
 * (sémantique historique). Parcourt au plus `MAX_DUP_PAGES` lots d'homonymes.
 */
const MAX_DUP_PAGES = 5;

export async function parkExistsWithNameAndAddress(
  name: string,
  address: string,
  opts: { communeId?: string } = {},
): Promise<boolean> {
  const supabase = getSupabase();
  let last: string | null = null;
  for (let page = 0; page < MAX_DUP_PAGES; page++) {
    let q = supabase
      .from("park_public")
      .select(`id,name,formatted_address${orgScopeSelect({ communeId: opts.communeId })}`)
      .ilike("name", name.replace(ILIKE_SPECIALS, "\\$&"))
      .order("id", { ascending: true })
      .limit(FETCH_BATCH_SIZE);
    q = applyOrgScope(q, { communeId: opts.communeId });
    if (last) q = q.gt("id", last);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as unknown as { id: string; name: string; formatted_address: string | null }[];
    if (batch.some((p) => p.name === name && p.formatted_address === address)) return true;
    if (batch.length < FETCH_BATCH_SIZE) return false;
    last = batch[batch.length - 1].id;
  }
  return false;
}

// ── Server-paginated management list (BO Lot 3A, Lot A) ──────────────────

export const PARKS_PAGE_SIZE = 25;

/** Columns the list can sort on server-side. */
export type ParksSortKey = "name" | "created_at" | "updated_at";

export interface ListParksPageOpts {
  communeId?: string;
  /** Case-insensitive substring match on the park name. */
  q?: string;
  status?: ParkStatus[];
  verification?: VerificationStatus[];
  /** Source d'ORIGINE (`park_sources.source_type`), filtre par jointure serveur. */
  sourceTypes?: SourceType[];
  /** Filtre « Collectivité » (Admin) — distinct de `communeId` (périmètre de session). */
  organizationId?: string;
  countryCode?: string;
  sort?: ParksSortKey;
  order?: "asc" | "desc";
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

/**
 * Colonnes réellement lues par les listes (Admin + export) — la vue `park_public` calcule
 * chaque colonne sélectionnée par des sous-requêtes corrélées (features, scores, noms
 * traduits…) : ne pas les demander évite ce coût sur chaque ligne.
 */
const LIST_COLS =
  "id,name,country_code,latitude,longitude,lat,lng,min_age,max_age,moderation_status,status," +
  "verification_status,has_open_report,created_at,updated_at,formatted_address,organization_id,commune_id,photos";

export type ParkListRow = Pick<
  Park,
  | "id"
  | "name"
  | "country_code"
  | "latitude"
  | "longitude"
  | "lat"
  | "lng"
  | "min_age"
  | "max_age"
  | "moderation_status"
  | "status"
  | "verification_status"
  | "has_open_report"
  | "created_at"
  | "updated_at"
  | "formatted_address"
  | "organization_id"
  | "commune_id"
  | "photos"
>;

/** Une ligne de liste et sa provenance : `source_type` = source d'ORIGINE (déterministe),
 * `enrichment_sources` = enrichissements (ex. `reverse_geocode`), jamais confondus. */
export type ParkWithSource = ParkListRow & { source_type: SourceType | null; enrichment_sources: string[] };

export interface ParksPage {
  rows: ParkWithSource[];
  total: number;
  /** Page effectivement servie (ramenée dans la profondeur atteignable). */
  page: number;
  pageSize: number;
  /** Nombre de pages ATTEIGNABLES (≤ `MAX_DEEP_OFFSET / pageSize`). */
  pageCount: number;
  /** `true` si `total` dépasse la profondeur atteignable : affiner les filtres pour voir la suite. */
  truncatedDepth: boolean;
}

/** Sources d'enrichissement (valeurs d'enum DB absentes de `SourceType`) : jamais une origine. */
const ENRICHMENT_SOURCES: ReadonlySet<string> = new Set(["reverse_geocode"]);

/** Priorité des origines — miroir de `source_priority()` (migration 0024). */
const ORIGIN_PRIORITY: Record<string, number> = {
  toboggo: 100,
  municipality: 90,
  open_data: 80,
  partner: 70,
  osm: 50,
  user: 40,
  other: 10,
};

/**
 * Source d'origine d'un parc, déterministe (indépendante de l'ordre de la jointure) :
 * priorité la plus haute parmi les ORIGINES ; `reverse_geocode` n'est jamais l'origine
 * (s'il est la seule source connue, `source` est `null` et l'enrichissement reste exposé
 * dans `enrichments`).
 */
export function pickPrimarySource(types: readonly string[]): { source: SourceType | null; enrichments: string[] } {
  const enrichments = [...new Set(types.filter((t) => ENRICHMENT_SOURCES.has(t)))].sort();
  const origins = [...new Set(types.filter((t) => !ENRICHMENT_SOURCES.has(t)))];
  origins.sort((a, b) => (ORIGIN_PRIORITY[b] ?? 0) - (ORIGIN_PRIORITY[a] ?? 0) || (a < b ? -1 : 1));
  const source = (origins[0] ?? null) as SourceType | null;
  return { source, enrichments };
}

/**
 * Batched `park_sources` lookup for a known set of park ids — one request. Source = origine
 * déterministe (`pickPrimarySource`).
 */
export async function listParkSourcesByIds(parkIds: string[]): Promise<Map<string, SourceType>> {
  const map = new Map<string, SourceType>();
  if (!parkIds.length) return map;
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_sources").select("park_id, source_type").in("park_id", parkIds);
  if (error) throw error;
  const byPark = new Map<string, string[]>();
  for (const row of (data ?? []) as { park_id: string; source_type: string }[]) {
    byPark.set(row.park_id, [...(byPark.get(row.park_id) ?? []), row.source_type]);
  }
  for (const [id, types] of byPark) {
    const { source } = pickPrimarySource(types);
    if (source) map.set(id, source);
  }
  return map;
}

type RowWithEmbeddedSource = ParkListRow & { park_sources: { source_type: string }[] | null };

function mapParkRows(data: unknown): ParkWithSource[] {
  const rows = (data ?? []) as unknown as RowWithEmbeddedSource[];
  return rows.map((raw) => {
    const sources = (raw.park_sources ?? []).map((s) => s.source_type);
    const park = stripEmbeds(raw) as unknown as ParkListRow;
    const { source, enrichments } = pickPrimarySource(sources);
    return { ...park, source_type: source, enrichment_sources: enrichments };
  });
}

/** Valeur citée pour une expression `or=(…)` PostgREST (virgules/parenthèses/guillemets). */
function quoteFilterValue(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Curseur keyset : la ligne suivante dans l'ordre `(sort, id asc)`. Évite l'OFFSET profond
 * (coût linéaire) pour les parcours séquentiels (export). `last` = dernière ligne reçue.
 */
function keysetCondition(
  sort: ParksSortKey,
  ascending: boolean,
  last: { value: string; id: string },
): string {
  const op = ascending ? "gt" : "lt";
  const v = quoteFilterValue(last.value);
  return `${sort}.${op}.${v},and(${sort}.eq.${v},id.gt.${quoteFilterValue(last.id)})`;
}

/**
 * Filtres communs à `listParksPage` et `listAllParksForExport` (une seule implémentation,
 * l'export ne peut pas diverger de la liste). Les périmètres d'organisation sont des
 * jointures serveur. Le filtre « source » est une jointure DISTINCTE (`src_filter`) de
 * l'embed d'affichage : afficher la source d'origine reste possible même filtré.
 */
function buildParksQuery(
  supabase: ReturnType<typeof getSupabase>,
  opts: Pick<
    ListParksPageOpts,
    "q" | "status" | "verification" | "sourceTypes" | "countryCode" | "sort" | "order" | "communeId" | "organizationId"
  >,
  settings: { cols: string; withCount: boolean },
) {
  const sort: ParksSortKey = opts.sort ?? "updated_at";
  const ascending = (opts.order ?? "desc") === "asc";
  const sourceFilterActive = !!opts.sourceTypes?.length;
  const select =
    `${settings.cols}, park_sources(source_type)` +
    (sourceFilterActive ? ", src_filter:park_sources!inner(source_type)" : "") +
    orgScopeSelect(opts);

  let query = supabase
    .from("park_public")
    .select(select, settings.withCount ? { count: "exact" } : undefined)
    .order(sort, { ascending })
    // Départage stable : une ligne n'apparaît jamais sur deux pages.
    .order("id", { ascending: true });

  if (sourceFilterActive) query = query.in("src_filter.source_type", opts.sourceTypes!);
  query = applyOrgScope(query, opts);
  if (opts.status?.length) query = query.in("moderation_status", opts.status);
  if (opts.verification?.length) query = query.in("verification_status", opts.verification);
  if (opts.countryCode) query = query.eq("country_code", opts.countryCode);
  const q = opts.q?.trim();
  if (q) query = query.ilike("name", `%${q}%`);

  return { query, sort, ascending };
}

export async function listParksPage(opts: ListParksPageOpts = {}): Promise<ParksPage> {
  const supabase = getSupabase();
  const pageSize = Math.max(1, Math.trunc(opts.pageSize ?? PARKS_PAGE_SIZE));
  const maxPage = Math.max(1, Math.floor(MAX_DEEP_OFFSET / pageSize));
  // Une page demandée au-delà de la profondeur atteignable est ramenée à la dernière
  // atteignable (URL ancienne / saisie manuelle) : jamais d'OFFSET > MAX_DEEP_OFFSET.
  const page = Math.min(maxPage, Math.max(1, Math.trunc(opts.page ?? 1)));

  const from = (page - 1) * pageSize;
  const { query } = buildParksQuery(supabase, opts, { cols: LIST_COLS, withCount: true });
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  const total = count ?? 0;
  const realPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    rows: mapParkRows(data),
    total,
    page,
    pageSize,
    pageCount: Math.min(realPages, maxPage),
    truncatedDepth: realPages > maxPage,
  };
}

export type ListAllParksOpts = Omit<ListParksPageOpts, "page" | "pageSize">;

/** Export refusé : trop de résultats pour un export navigateur. */
export class ExportTooLargeError extends Error {
  constructor(
    readonly total: number,
    readonly limit: number,
  ) {
    super(`Export trop volumineux : ${total} parcs (maximum ${limit}). Affinez les filtres.`);
    this.name = "ExportTooLargeError";
  }
}

/**
 * Tous les parcs correspondant aux filtres, par lots keyset de 1000 **séquentiels** (jamais
 * `Promise.all` sur N pages, jamais d'OFFSET profond). Le total exact est connu dès le premier
 * lot : au-delà de `EXPORT_MAX_ROWS`, `ExportTooLargeError` est levée AVANT tout autre lot.
 * Mêmes filtres que `listParksPage` (`buildParksQuery`).
 */
export async function listAllParksForExport(opts: ListAllParksOpts = {}): Promise<ParkWithSource[]> {
  const supabase = getSupabase();
  const rows: ParkWithSource[] = [];
  let last: { value: string; id: string } | null = null;
  let total = 0;
  for (let first = true; ; first = false) {
    const { query, sort, ascending } = buildParksQuery(supabase, opts, { cols: LIST_COLS, withCount: first });
    const q = last ? query.or(keysetCondition(sort, ascending, last)) : query;
    const res = await q.limit(FETCH_BATCH_SIZE);
    if (res.error) throw res.error;
    if (first) {
      total = res.count ?? 0;
      if (total > EXPORT_MAX_ROWS) throw new ExportTooLargeError(total, EXPORT_MAX_ROWS);
    }
    const batch = (res.data ?? []) as unknown as (ParkListRow & Record<string, unknown>)[];
    rows.push(...mapParkRows(batch));
    if (batch.length < FETCH_BATCH_SIZE || rows.length >= total) break;
    const tail = batch[batch.length - 1];
    last = { value: String(tail[sort]), id: tail.id };
  }
  return rows;
}

// ── Write path ────────────────────────────────────────────────────────────
// Callers still pass the old flat shape. We split it into the canonical
// `parks` columns + `park_features` rows + `organization_parks` link.

const SURFACE_TO_FEATURE: Record<string, string> = {
  sable: "sand",
  gazon: "grass",
  sol_souple: "rubber",
  non_precise: "unknown",
};
const PLAY_CODE_MAP: Record<string, string> = {
  toboggan: "slide",
  springs: "springer",
  waterplay: "water_play",
  motorcourse: "motor_course",
};
const AMENITY_TO_FEATURE = {
  wc: "toilets",
  pmr: "wheelchair_access",
  benches: "benches",
  parking: "parking",
  water: "drinking_water",
} as const;

/**
 * `parks` keeps its V1 columns during coexistence. Callers still pass the old
 * flat shape (`lat`/`lng`/`formatted_address`/`age_min`/`status`…); we map it to
 * the canonical V2 columns. The V1 columns `lat`, `lng`, `formatted_address`
 * are then re-derived by the `parks_v1_compat` BEFORE INSERT/UPDATE trigger
 * (supabase/migrations/0009_v2_parks_columns.sql — see database-migration.md §9),
 * so the repository never writes them and never invents placeholder coordinates.
 */
type ParkWriteRow = Omit<TablesUpdate<"parks">, "lat" | "lng" | "formatted_address">;
type ParkInsertRow = Omit<TablesInsert<"parks">, "lat" | "lng" | "formatted_address">;

function requireField<T>(value: T | null | undefined, field: string): T {
  if (value == null) throw new Error(`createPark : champ obligatoire manquant : ${field}`);
  return value;
}

/**
 * A park must carry its real GPS position. No caller may substitute a
 * placeholder (e.g. a city-centre fallback) when the real position is
 * unknown — refuse the write instead (see database-migration.md §5 and the
 * back-office audit, bug B1). `(0, 0)` ("Null Island") is rejected too: it is
 * never a legitimate park location for this France-only product and is the
 * classic sign of an uninitialised value slipping through.
 */
export function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function assertValidCoordinates(lat: unknown, lng: unknown): void {
  if (!isValidCoordinate(lat, lng)) {
    throw new Error(
      "Coordonnées GPS invalides ou manquantes : impossible de créer un parc sans sa position réelle.",
    );
  }
}

/**
 * Refuse an inconsistent age range. Only enforced when the caller supplies
 * *both* bounds as real numbers in the same write — a partial update that
 * touches one bound is not cross-checked against the stored value (no DB read
 * here). `null` (explicit clear) is fine on either side.
 */
export function assertValidAgeRange(min: unknown, max: unknown): void {
  if (typeof min === "number" && typeof max === "number" && min > max) {
    throw new Error("Âge invalide : l'âge minimum ne peut pas dépasser l'âge maximum.");
  }
}

function splitParkInput(input: Partial<Park>) {
  const {
    age_min, age_max, status, formatted_address, address_line, postal_code, city,
    commune_id, organization_id,
    surface, play_equipment, wc, shade, fenced, pmr, benches, water, parking,
    features, cover_photo, photos, translated_names, score, has_score,
    rating, review_count, has_open_report, views,
    lat, lng,
    ...rest
  } = input;

  const parkRow: ParkWriteRow = { ...rest };

  // ── Ages ──────────────────────────────────────────────────────────────
  // Key absent  → leave untouched.
  // Key present with a number → set it.
  // Key present with null     → clear it (write NULL to the canonical V2
  //   column; `parks_v1_compat` re-derives the NOT NULL V1 `age_min`/`age_max`
  //   back to their 0 / 12 defaults, so V1 compat is preserved).
  assertValidAgeRange(age_min, age_max);
  const hasAgeMin = "age_min" in input;
  const hasAgeMax = "age_max" in input;
  if (hasAgeMin) parkRow.min_age = age_min ?? null;
  if (hasAgeMax) parkRow.max_age = age_max ?? null;
  if (hasAgeMin || hasAgeMax) parkRow.ages_derived = false;

  if (status != null) parkRow.moderation_status = status;
  if (lat != null && parkRow.latitude == null) parkRow.latitude = lat;
  if (lng != null && parkRow.longitude == null) parkRow.longitude = lng;

  // ── Structured address ────────────────────────────────────────────────
  // The canonical V2 columns are written straight through (same "key present"
  // semantics as ages: present+null clears, present+string sets). The
  // `parks_v1_compat` trigger keeps the V1 `formatted_address` column in sync
  // from `address_line`; `park_public.formatted_address` is recomposed by the
  // view from address_line + postal_code + city. `admin_area_1/2` are not
  // touched here (derived later, when geocoding lands — 3C.3+).
  if ("address_line" in input) parkRow.address_line = address_line ?? null;
  if ("postal_code" in input) parkRow.postal_code = postal_code ?? null;
  if ("city" in input) parkRow.city = city ?? null;
  // Legacy flat callers that only pass `formatted_address`: fall back to
  // filling `address_line` (unless a structured `address_line` was given).
  if (formatted_address != null && !("address_line" in input)) {
    parkRow.address_line = formatted_address || null;
  }

  const featureRows: { code: string; status: FeatureStatus; value?: string | null; quantity?: number | null }[] = [];
  if (surface != null) featureRows.push({ code: "surface_type", status: "available", value: SURFACE_TO_FEATURE[surface] ?? "unknown" });
  if (fenced != null) featureRows.push({ code: "fence_status", status: "available", value: fenced ? "fully_fenced" : "not_fenced" });
  if (shade != null) featureRows.push({ code: "shade_level", status: "available", value: shade ? "partial" : "none" });
  for (const amenity of Object.keys(AMENITY_TO_FEATURE) as (keyof typeof AMENITY_TO_FEATURE)[]) {
    const v = input[amenity];
    if (v != null) featureRows.push({ code: AMENITY_TO_FEATURE[amenity], status: v ? "available" : "unavailable" });
  }
  if (Array.isArray(play_equipment)) {
    for (const raw of play_equipment) {
      featureRows.push({ code: PLAY_CODE_MAP[raw] ?? raw, status: "available" });
    }
  }

  const orgId = organization_id ?? commune_id ?? null;
  return { parkRow, featureRows, orgId };
}

/**
 * Phase 1 (D3) — attributs dont la valeur canonique est protégée par la
 * provenance (`park_attribute_sources`). Voir `supabase/migrations/0032`.
 *
 * Une édition back-office de l'un de ces attributs ne doit PAS écrire
 * `parks.*` en direct : elle passe par la RPC `apply_park_attribute`, qui
 *   1. enregistre une source `toboggo` / `municipality` (priorité > OSM),
 *   2. applique le gate `can_source_replace_attribute`,
 *   3. archive la valeur précédente (`is_current = false`),
 *   4. projette la nouvelle valeur dans `parks`,
 * de sorte qu'un réimport OSM ne peut plus l'écraser silencieusement.
 *
 * Les autres colonnes (`description`, `slug`, `moderation_status`,
 * `operational_status`, …) ne sont jamais touchées par l'import OSM :
 * elles restent en écriture directe.
 */
const PROVENANCE_ADDRESS_KEYS = [
  "address_line",
  "postal_code",
  "city",
  "admin_area_1",
  "admin_area_2",
] as const;

/**
 * Peel the provenance-tracked attributes off `parkRow`, apply each through
 * `apply_park_attribute` (records a `toboggo` / `municipality` source, gated so
 * a lower-priority OSM re-import can no longer overwrite it — migration 0032),
 * and return the columns that still need a plain `parks` update.
 *
 * **Presence (`k in rest`), not `!= null`, drives every decision here.** The
 * back-office clears a field by sending it explicitly as `null` (see
 * `splitParkInput`). That clear must be honoured — never silently reverted to
 * the stored value, never silently downgraded to a direct write.
 *
 * One documented exception — an **age clear** (`min_age` / `max_age` = `null`):
 * `apply_park_attribute` (0032, deployed to prod) rejects a JSON-`null`
 * `value_json`, so a numeric bound goes through the RPC while a clear is written
 * directly, in an explicit branch below (never a fall-through). Routing a clear
 * through provenance too needs a follow-up migration that lets the RPC take
 * `null` — see the merge report.
 */
async function applyProvenanceAttributes(id: string, parkRow: ParkWriteRow): Promise<ParkWriteRow> {
  const supabase = getSupabase();
  const rest: ParkWriteRow = { ...parkRow };
  const calls: { key: string; value: Json }[] = [];

  // ── name ── `parks.name` is NOT NULL, so there is no "clear" case.
  if (rest.name != null) {
    calls.push({ key: "name", value: rest.name });
    delete rest.name;
  }

  // ── ages ── a numeric bound → RPC ; an explicit clear → kept for the direct
  // update (the RPC cannot take null — see the doc comment).
  let ageClearKept = false;
  for (const col of ["min_age", "max_age"] as const) {
    if (!(col in rest)) continue;
    const v = rest[col];
    if (v == null) {
      ageClearKept = true; // explicit clear stays in `rest`
    } else {
      calls.push({ key: col, value: v });
      delete rest[col];
    }
  }
  // `ages_derived` is added by `splitParkInput` whenever an age key was present:
  //  - a clear stays in the direct row → keep `ages_derived = false` alongside it;
  //  - every age change routed to the RPC → its projection sets `ages_derived`,
  //    so drop the leftover here.
  if (!ageClearKept && "ages_derived" in rest && !("min_age" in rest) && !("max_age" in rest)) {
    delete rest.ages_derived;
  }

  // ── address (full 5-field composite) & location ──
  const addrChanged = PROVENANCE_ADDRESS_KEYS.some((k) => k in rest);
  const locChanged = rest.latitude != null || rest.longitude != null;

  if (addrChanged || locChanged) {
    // The RPC stores the whole composite; merge the patch over the current
    // values by *presence*, so an explicit `null` (clear) survives.
    const current = await getPark(id);
    if (addrChanged) {
      const field = (k: (typeof PROVENANCE_ADDRESS_KEYS)[number]): string | null => {
        const v = k in rest ? rest[k] : current[k];
        return v == null ? null : String(v);
      };
      calls.push({
        key: "address",
        value: {
          address_line: field("address_line"),
          postal_code: field("postal_code"),
          city: field("city"),
          admin_area_1: field("admin_area_1"),
          admin_area_2: field("admin_area_2"),
        },
      });
      for (const k of PROVENANCE_ADDRESS_KEYS) delete rest[k];
    }
    if (locChanged) {
      calls.push({
        key: "location",
        value: {
          lat: rest.latitude ?? current.latitude,
          lng: rest.longitude ?? current.longitude,
        },
      });
      delete rest.latitude;
      delete rest.longitude;
    }
  }

  for (const call of calls) {
    const { error } = await supabase.rpc("apply_park_attribute", {
      p_park_id: id,
      p_attribute_key: call.key,
      p_value_json: call.value,
    });
    if (error) throw error;
  }
  return rest;
}

async function applyFeatures(parkId: string, rows: { code: string; status: FeatureStatus; value?: string | null; quantity?: number | null }[]) {
  if (!rows.length) return;
  const supabase = getSupabase();
  const { data: catalogue } = await supabase.from("features").select("id,code");
  const byCode = new Map((catalogue ?? []).map((f: { id: string; code: string }) => [f.code, f.id]));
  const upserts = rows
    .filter((r) => byCode.has(r.code))
    .map((r) => ({
      park_id: parkId,
      feature_id: byCode.get(r.code)!,
      status: r.status,
      value: r.value ?? null,
      quantity: r.quantity ?? null,
    }));
  if (upserts.length) {
    const { error } = await supabase.from("park_features").upsert(upserts, { onConflict: "park_id,feature_id" });
    if (error) throw error;
  }
}

export async function createPark(input: Partial<Park>): Promise<Park> {
  const supabase = getSupabase();
  const { parkRow, featureRows, orgId } = splitParkInput(input);
  const latitude = requireField(parkRow.latitude, "latitude");
  const longitude = requireField(parkRow.longitude, "longitude");
  // No placeholder coordinates, ever (bug B1) — see assertValidCoordinates doc comment.
  assertValidCoordinates(latitude, longitude);
  // The DB has no column default / trigger for country_code / timezone
  // (database-migration.md §5). Never a silent "FR / Europe/Paris": resolved
  // from the coordinates (and the caller's country when known), or
  // `ParkLocaleError` — the caller must surface it.
  const locale = await resolveParkLocale(latitude, longitude, {
    country_code: parkRow.country_code,
    timezone: parkRow.timezone,
  });
  const insertRow: ParkInsertRow = {
    ...parkRow,
    name: requireField(parkRow.name, "name"),
    latitude,
    longitude,
    country_code: locale.country_code,
    timezone: locale.timezone,
  };
  const { data, error } = await supabase
    .from("parks")
    // `lat`/`lng`/`formatted_address` are re-derived by parks_v1_compat (see splitParkInput).
    .insert(insertRow as TablesInsert<"parks">)
    .select("id")
    .single();
  if (error) throw error;
  const parkId = data.id;
  await applyFeatures(parkId, featureRows);
  if (orgId) {
    // Links the park to its owning organisation (bug B2 depends on this
    // succeeding — a failure here must not be swallowed, or the park is
    // created but invisible to its own collectivité).
    const { error: orgLinkError } = await supabase.from("organization_parks").upsert(
      { organization_id: orgId, park_id: parkId, role: "owner" },
      { onConflict: "organization_id,park_id" },
    );
    if (orgLinkError) throw orgLinkError;
  }
  return getPark(parkId);
}

export async function updatePark(id: string, patch: Partial<Park>, _historyNote?: string): Promise<Park> {
  const supabase = getSupabase();
  const { parkRow, featureRows, orgId } = splitParkInput(patch);

  // 1) Validations (BO). A position edit gets the same range check as
  // `createPark` (bug B1); both bounds must move together — a lone
  // latitude/longitude write would leave the pair inconsistent and there is no
  // DB read here to fill the missing half. Runs *before* the provenance step,
  // which would otherwise peel `latitude`/`longitude` away.
  const touchesLat = parkRow.latitude != null;
  const touchesLng = parkRow.longitude != null;
  if (touchesLat || touchesLng) {
    if (!touchesLat || !touchesLng) {
      throw new Error(
        "Modification de position : latitude et longitude doivent être fournies ensemble.",
      );
    }
    assertValidCoordinates(parkRow.latitude, parkRow.longitude);
  }

  // 2) Provenance-tracked attributes (name / ages / address / location) go
  // through `apply_park_attribute` so a manual correction records a
  // Toboggo/collectivité source and survives a later OSM re-import (migration
  // 0032). Whatever is left (`description`, `slug`, `moderation_status`,
  // `operational_status`, an explicit age clear) is a plain column update.
  const directRow = await applyProvenanceAttributes(id, parkRow);
  if (Object.keys(directRow).length) {
    const { error } = await supabase.from("parks").update(directRow).eq("id", id);
    if (error) throw error;
  }
  await applyFeatures(id, featureRows);
  if (orgId) {
    const { error: orgLinkError } = await supabase.from("organization_parks").upsert(
      { organization_id: orgId, park_id: id, role: "owner" },
      { onConflict: "organization_id,park_id" },
    );
    if (orgLinkError) throw orgLinkError;
  }
  return getPark(id);
}

export async function setParkStatus(id: string, status: ParkStatus, note?: string) {
  return updatePark(id, { status }, note ?? `Statut → ${status}`);
}

export async function deletePark(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("parks").delete().eq("id", id);
  if (error) throw error;
}

/** §14 — per-park history now comes from the generic audit_log. */
export async function getParkHistory(parkId: string): Promise<ParkEditHistoryEntry[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id,action,field,new_value,actor_id,source,created_at")
    .eq("entity_type", "parks")
    .eq("entity_id", parkId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    park_id: parkId,
    actor: (r.actor_id as string) ?? (r.source as string) ?? "Système",
    action:
      r.action === "insert" ? "Créé" : r.action === "delete" ? "Supprimé" : "Modifié",
    note: (r.field as string) ?? null,
    created_at: r.created_at as string,
  }));
}

export async function incrementParkViews(id: string) {
  const supabase = getSupabase();
  await supabase.rpc("increment_park_views", { p_park_id: id });
}
