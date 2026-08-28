import { getSupabase } from "../supabaseClient";
import type {
  ExternalId,
  ParkEntrance,
  ParkMedia,
  ParkName,
  ParkOpeningHours,
  ParkScore,
  ParkSource,
  ParkZone,
} from "../types";

// ── §6 Zones ─────────────────────────────────────────────────────────────
export async function listZones(parkId: string): Promise<ParkZone[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_zones")
    .select("*")
    .eq("park_id", parkId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ParkZone[];
}

export async function upsertZone(zone: Partial<ParkZone> & { park_id: string; name: string }): Promise<ParkZone> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_zones").upsert(zone).select().single();
  if (error) throw error;
  return data as ParkZone;
}

export async function deleteZone(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("park_zones").delete().eq("id", id);
  if (error) throw error;
}

// ── §7 Entrances ─────────────────────────────────────────────────────────
export async function listEntrances(parkId: string): Promise<ParkEntrance[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_entrances").select("*").eq("park_id", parkId);
  if (error) throw error;
  return (data ?? []) as ParkEntrance[];
}

// ── §9 Opening hours ─────────────────────────────────────────────────────
export async function listOpeningHours(parkId: string): Promise<ParkOpeningHours[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_opening_hours").select("*").eq("park_id", parkId);
  if (error) throw error;
  return (data ?? []) as ParkOpeningHours[];
}

// ── §10 Sources / external ids ───────────────────────────────────────────
export async function listSources(parkId: string): Promise<ParkSource[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_sources").select("*").eq("park_id", parkId);
  if (error) throw error;
  return (data ?? []) as ParkSource[];
}

export async function listExternalIds(parkId: string): Promise<ExternalId[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("external_ids").select("*").eq("park_id", parkId);
  if (error) throw error;
  return (data ?? []) as ExternalId[];
}

// ── §18 Names ────────────────────────────────────────────────────────────
export async function listNames(parkId: string): Promise<ParkName[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_names").select("*").eq("park_id", parkId);
  if (error) throw error;
  return (data ?? []) as ParkName[];
}

// ── §15 Media ────────────────────────────────────────────────────────────
export async function listMedia(parkId: string): Promise<ParkMedia[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_media")
    .select("*")
    .eq("park_id", parkId)
    .order("is_cover", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ParkMedia[];
}

export async function addMedia(input: {
  park_id: string;
  url: string;
  user_id?: string | null;
  category?: ParkMedia["category"];
  caption?: string | null;
  is_cover?: boolean;
}): Promise<ParkMedia> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_media")
    .insert({
      park_id: input.park_id,
      url: input.url,
      user_id: input.user_id ?? null,
      category: input.category ?? "other",
      caption: input.caption ?? null,
      is_cover: input.is_cover ?? false,
      status: "approved",
    })
    .select()
    .single();
  if (error) throw error;
  return data as ParkMedia;
}

/** Legacy helper: the old model kept `parks.photos` as a text[]. Now each photo
 * is a `park_media` row. */
export async function addParkPhotos(parkId: string, urls: string[], userId?: string | null): Promise<void> {
  if (!urls.length) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("park_media").insert(
    urls.map((url) => ({ park_id: parkId, url, user_id: userId ?? null, category: "other", status: "approved" })),
  );
  if (error) throw error;
}

// ── §16 Scores ───────────────────────────────────────────────────────────
export async function getLatestScore(parkId: string): Promise<ParkScore | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_scores")
    .select("*")
    .eq("park_id", parkId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ParkScore | null;
}

export async function recalculateScore(parkId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("recalculate_park_score", { p_park_id: parkId });
  if (error) throw error;
}
