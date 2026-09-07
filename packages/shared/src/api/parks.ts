import { getSupabase } from "../supabaseClient";
import type {
  FeatureCategory,
  FeatureStatus,
  Park,
  ParkEditHistoryEntry,
  ParkFeatureView,
  ParkStatus,
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
}

/** One row of the PostGIS `nearby_parks` RPC — a flat projection, narrower than `Park`. */
type NearbyParkRow = Database["public"]["Functions"]["nearby_parks"]["Returns"][number];

const AMENITY_KEYS = ["wc", "shade", "fenced", "pmr", "benches", "water", "parking"] as const;

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

/** PostGIS `nearby_parks` RPC — real geospatial "near me". Returns the flat
 * compatibility shape plus the normalised `features` map. */
export async function fetchNearbyParks(params: NearbyParksParams): Promise<(Park & { distance_m: number })[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("nearby_parks", {
    p_lat: params.lat,
    p_lng: params.lng,
    p_radius_m: params.radiusMeters ?? 20000,
  });
  if (error) throw error;
  let rows = (data ?? []).map(nearbyRowToPark);
  if (params.ageMin != null) rows = rows.filter((p) => (p.age_max ?? p.max_age ?? 99) >= params.ageMin!);
  if (params.ageMax != null) rows = rows.filter((p) => (p.age_min ?? p.min_age ?? 0) <= params.ageMax!);
  if (params.amenities) {
    for (const key of AMENITY_KEYS) {
      if (params.amenities[key]) rows = rows.filter((p) => p[key]);
    }
  }
  return rows;
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

/**
 * Park ids linked to an organisation via `organization_parks` — the canonical
 * V2 rattachement. `listReports` / `listReviews` already resolved this inline;
 * centralised here so every commune-scoped read (parks / reports / reviews /
 * pending media) uses the same source of truth instead of the legacy V1
 * `parks.commune_id` column, which `createPark` never populates.
 *
 * Screens routinely call several of `listParks`/`listReports`/`listReviews`/
 * `listPendingMedia` in parallel for the same organisation (e.g. the
 * dashboard, or the sidebar badge counts) — each would otherwise re-run this
 * same lookup. In-flight calls for the same `organizationId` are coalesced
 * into a single request; the cache entry is cleared as soon as it settles
 * (success or failure), so this never serves stale data across renders or
 * after a mutation invalidates a query — only truly concurrent callers share
 * a request.
 */
const inFlightOrgParkIds = new Map<string, Promise<string[]>>();

export function listOrgParkIds(organizationId: string): Promise<string[]> {
  const inFlight = inFlightOrgParkIds.get(organizationId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("organization_parks")
      .select("park_id")
      .eq("organization_id", organizationId);
    if (error) throw error;
    return (data ?? []).map((r: { park_id: string }) => r.park_id);
  })();

  const tracked = promise.finally(() => {
    if (inFlightOrgParkIds.get(organizationId) === tracked) inFlightOrgParkIds.delete(organizationId);
  });
  inFlightOrgParkIds.set(organizationId, tracked);
  return tracked;
}

/** `.in("id", ids)` with an empty list matches every row (Postgres/PostgREST
 * treats `IN ()` as always-false only when at least one value is given) — a
 * commune with 0 linked parks must see 0 rows, not everything. Callers pass
 * this sentinel, matching the pattern already used by `listReports`/`listReviews`. */
const NO_MATCH_SENTINEL = "00000000-0000-0000-0000-000000000000";

export async function listParks(opts: { communeId?: string; status?: ParkStatus[] } = {}): Promise<Park[]> {
  const supabase = getSupabase();
  let query = supabase.from("park_public").select(PARK_COLS).order("created_at", { ascending: false });
  if (opts.communeId) {
    const ids = await listOrgParkIds(opts.communeId);
    query = query.in("id", ids.length ? ids : [NO_MATCH_SENTINEL]);
  }
  if (opts.status?.length) query = query.in("moderation_status", opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as Park[];
}

// ── Server-paginated management list (BO Lot 3A) ──────────────────────────
// Separate from `listParks` (which stays an unpaginated array, still used by
// the dashboard / map / sidebar counts) — this one adds page/sort/search/
// verification filtering server-side so `/parks` scales past a few hundred
// rows. `park_public.photos` is already the aggregated list of *approved*
// media URLs, so the photo count is `row.photos.length` — no extra query.

export const PARKS_PAGE_SIZE = 25;

/** Columns the list can sort on server-side. `name`/`created_at`/`updated_at`
 * are real `parks` columns; computed cells (photo count, open-report flag)
 * are intentionally not sortable. */
export type ParksSortKey = "name" | "created_at" | "updated_at";

export interface ListParksPageOpts {
  communeId?: string;
  /** Case-insensitive substring match on the park name. */
  q?: string;
  status?: ParkStatus[];
  verification?: VerificationStatus[];
  sort?: ParksSortKey;
  order?: "asc" | "desc";
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

export interface ParksPage {
  rows: Park[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function listParksPage(opts: ListParksPageOpts = {}): Promise<ParksPage> {
  const supabase = getSupabase();
  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const pageSize = Math.max(1, Math.trunc(opts.pageSize ?? PARKS_PAGE_SIZE));
  const sort: ParksSortKey = opts.sort ?? "updated_at";
  const ascending = (opts.order ?? "desc") === "asc";

  let query = supabase
    .from("park_public")
    .select(PARK_COLS, { count: "exact" })
    .order(sort, { ascending })
    // Stable tiebreaker so a row never straddles two pages when the sort
    // column has duplicate values (e.g. a bulk import sharing a timestamp).
    .order("id", { ascending: true });

  if (opts.communeId) {
    const ids = await listOrgParkIds(opts.communeId);
    query = query.in("id", ids.length ? ids : [NO_MATCH_SENTINEL]);
  }
  if (opts.status?.length) query = query.in("moderation_status", opts.status);
  if (opts.verification?.length) query = query.in("verification_status", opts.verification);
  const q = opts.q?.trim();
  if (q) query = query.ilike("name", `%${q}%`);

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  const total = count ?? 0;
  return {
    rows: (data ?? []) as unknown as Park[],
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
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
  const insertRow: ParkInsertRow = {
    ...parkRow,
    name: requireField(parkRow.name, "name"),
    latitude: requireField(parkRow.latitude, "latitude"),
    longitude: requireField(parkRow.longitude, "longitude"),
    // France-only product for now; a worldwide caller must pass these explicitly
    // — the DB has no column default / trigger for them (database-migration.md §5).
    country_code: parkRow.country_code ?? "FR",
    timezone: parkRow.timezone ?? "Europe/Paris",
  };
  // No placeholder coordinates, ever (bug B1) — see assertValidCoordinates doc comment.
  assertValidCoordinates(insertRow.latitude, insertRow.longitude);
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

  // A position edit gets the same range check as `createPark` (bug B1). Both
  // bounds must move together — a lone latitude/longitude write would leave the
  // pair inconsistent, and there is no DB read here to fill the missing half.
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

  if (Object.keys(parkRow).length) {
    const { error } = await supabase.from("parks").update(parkRow).eq("id", id);
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
