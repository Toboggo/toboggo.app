import { getSupabase } from "../supabaseClient";
import type { Park, ParkEditHistoryEntry, ParkStatus } from "../types";

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
  let rows = (data ?? []) as (Park & { distance_m: number })[];
  if (params.ageMin != null) rows = rows.filter((p) => (p.age_max ?? p.max_age ?? 99) >= params.ageMin!);
  if (params.ageMax != null) rows = rows.filter((p) => (p.age_min ?? p.min_age ?? 0) <= params.ageMax!);
  if (params.amenities) {
    for (const [key, wanted] of Object.entries(params.amenities)) {
      if (wanted) rows = rows.filter((p) => (p as unknown as Record<string, boolean>)[key]);
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
const AMENITY_TO_FEATURE: Record<string, string> = {
  wc: "toilets",
  pmr: "wheelchair_access",
  benches: "benches",
  parking: "parking",
  water: "drinking_water",
};

function splitParkInput(input: Partial<Park>) {
  const {
    age_min, age_max, status, formatted_address, commune_id, organization_id,
    surface, play_equipment, wc, shade, fenced, pmr, benches, water, parking,
    features, cover_photo, photos, translated_names, score, has_score,
    rating, review_count, has_open_report, views, ...rest
  } = input as Record<string, unknown>;

  const parkRow: Record<string, unknown> = { ...rest };
  if (age_min != null) parkRow.min_age = age_min;
  if (age_max != null) parkRow.max_age = age_max;
  if (age_min != null || age_max != null) parkRow.ages_derived = false;
  if (status != null) parkRow.moderation_status = status;
  if (formatted_address != null && parkRow.address_line == null) parkRow.address_line = formatted_address;

  const featureRows: { code: string; status: string; value?: string | null; quantity?: number | null }[] = [];
  if (surface != null) featureRows.push({ code: "surface_type", status: "available", value: SURFACE_TO_FEATURE[surface as string] ?? "unknown" });
  if (fenced != null) featureRows.push({ code: "fence_status", status: "available", value: fenced ? "fully_fenced" : "not_fenced" });
  if (shade != null) featureRows.push({ code: "shade_level", status: "available", value: shade ? "partial" : "none" });
  for (const [amenity, code] of Object.entries(AMENITY_TO_FEATURE)) {
    const v = (input as Record<string, unknown>)[amenity];
    if (v != null) featureRows.push({ code, status: v ? "available" : "unavailable" });
  }
  if (Array.isArray(play_equipment)) {
    for (const raw of play_equipment as string[]) {
      featureRows.push({ code: PLAY_CODE_MAP[raw] ?? raw, status: "available" });
    }
  }

  const orgId = (organization_id ?? commune_id) as string | null | undefined;
  return { parkRow, featureRows, orgId };
}

async function applyFeatures(parkId: string, rows: { code: string; status: string; value?: string | null; quantity?: number | null }[]) {
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
  if (parkRow.country_code == null) parkRow.country_code = "FR";
  if (parkRow.timezone == null) parkRow.timezone = "Europe/Paris";
  const { data, error } = await supabase.from("parks").insert(parkRow).select("id").single();
  if (error) throw error;
  const parkId = data.id as string;
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
  if (Object.keys(parkRow).length) {
    const { error } = await supabase.from("parks").update(parkRow).eq("id", id);
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
