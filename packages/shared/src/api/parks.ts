import { getSupabase } from "../supabaseClient";
import type {
  FeatureCategory,
  FeatureStatus,
  Park,
  ParkEditHistoryEntry,
  ParkFeatureView,
  ParkStatus,
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

export async function listParks(opts: { communeId?: string; status?: ParkStatus[] } = {}): Promise<Park[]> {
  const supabase = getSupabase();
  let query = supabase.from("park_public").select(PARK_COLS).order("created_at", { ascending: false });
  if (opts.communeId) query = query.eq("commune_id", opts.communeId);
  if (opts.status?.length) query = query.in("moderation_status", opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as Park[];
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

function splitParkInput(input: Partial<Park>) {
  const {
    age_min, age_max, status, formatted_address, commune_id, organization_id,
    surface, play_equipment, wc, shade, fenced, pmr, benches, water, parking,
    features, cover_photo, photos, translated_names, score, has_score,
    rating, review_count, has_open_report, views,
    lat, lng,
    ...rest
  } = input;

  const parkRow: ParkWriteRow = { ...rest };
  if (age_min != null) parkRow.min_age = age_min;
  if (age_max != null) parkRow.max_age = age_max;
  if (age_min != null || age_max != null) parkRow.ages_derived = false;
  if (status != null) parkRow.moderation_status = status;
  if (lat != null && parkRow.latitude == null) parkRow.latitude = lat;
  if (lng != null && parkRow.longitude == null) parkRow.longitude = lng;
  if (formatted_address != null && parkRow.address_line == null) parkRow.address_line = formatted_address;

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

/** Peel the provenance-tracked attributes off `parkRow`, apply each through
 * `apply_park_attribute`, and return the remaining columns for a plain
 * `parks` update. */
async function applyProvenanceAttributes(id: string, parkRow: ParkWriteRow): Promise<ParkWriteRow> {
  const supabase = getSupabase();
  const rest: ParkWriteRow = { ...parkRow };
  const calls: { key: string; value: Json }[] = [];

  if (rest.name != null) {
    calls.push({ key: "name", value: rest.name });
    delete rest.name;
  }
  if (rest.min_age != null) {
    calls.push({ key: "min_age", value: rest.min_age });
    delete rest.min_age;
  }
  if (rest.max_age != null) {
    calls.push({ key: "max_age", value: rest.max_age });
    delete rest.max_age;
  }
  if (calls.some((c) => c.key === "min_age" || c.key === "max_age")) {
    // `ages_derived` is set by the RPC's projection (`ages_derived = false`).
    delete rest.ages_derived;
  }

  const addrChanged = PROVENANCE_ADDRESS_KEYS.some((k) => rest[k] != null);
  const locChanged = rest.latitude != null || rest.longitude != null;

  if (addrChanged || locChanged) {
    // The RPC stores the full composite; merge the patch over the current values.
    const current = await getPark(id);
    if (addrChanged) {
      calls.push({
        key: "address",
        value: {
          address_line: (rest.address_line ?? current.address_line) ?? null,
          postal_code: (rest.postal_code ?? current.postal_code) ?? null,
          city: (rest.city ?? current.city) ?? null,
          admin_area_1: (rest.admin_area_1 ?? current.admin_area_1) ?? null,
          admin_area_2: (rest.admin_area_2 ?? current.admin_area_2) ?? null,
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
    await supabase.from("organization_parks").upsert(
      { organization_id: orgId, park_id: parkId, role: "owner" },
      { onConflict: "organization_id,park_id" },
    );
  }
  return getPark(parkId);
}

export async function updatePark(id: string, patch: Partial<Park>, _historyNote?: string): Promise<Park> {
  const supabase = getSupabase();
  const { parkRow, featureRows, orgId } = splitParkInput(patch);
  // Provenance-tracked attributes (name / ages / address / location) go through
  // `apply_park_attribute` so a manual correction records a Toboggo/collectivité
  // source and survives a later OSM re-import (migration 0032). The rest is a
  // plain column update.
  const directRow = await applyProvenanceAttributes(id, parkRow);
  if (Object.keys(directRow).length) {
    const { error } = await supabase.from("parks").update(directRow).eq("id", id);
    if (error) throw error;
  }
  await applyFeatures(id, featureRows);
  if (orgId) {
    await supabase.from("organization_parks").upsert(
      { organization_id: orgId, park_id: id, role: "owner" },
      { onConflict: "organization_id,park_id" },
    );
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
