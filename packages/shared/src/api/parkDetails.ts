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

/**
 * Add a real photo of a park as a `park_media` row.
 *
 * A park photo MUST represent the place and have an identifiable origin, so
 * `source` is required (0025):
 *   - `"user"`         — parent / contributor upload
 *   - `"municipality"` — collectivité back-office upload
 *   - `"toboggo"`      — Toboggo staff
 *   - `"open_data"` / `"partner"` — explicitly reusable open sources
 *
 * Never insert a generated, illustrative or generic image here — the empty
 * state is a UI concern (Toboggo placeholder), never a database row.
 */
export async function addMedia(input: {
  park_id: string;
  url: string;
  source: NonNullable<ParkMedia["source"]>;
  user_id?: string | null;
  category?: ParkMedia["category"];
  caption?: string | null;
  is_cover?: boolean;
  source_url?: string | null;
  author?: string | null;
  license?: string | null;
  attribution?: string | null;
  status?: ParkMedia["status"];
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
      status: input.status ?? "approved",
      source: input.source,
      source_url: input.source_url ?? null,
      author: input.author ?? null,
      license: input.license ?? null,
      attribution: input.attribution ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ParkMedia;
}

/** Add several photos coming from the same source (e.g. a contributor upload
 * batch). Each becomes a `park_media` row with recorded provenance. */
export async function addParkPhotos(
  parkId: string,
  urls: string[],
  opts: {
    source: NonNullable<ParkMedia["source"]>;
    userId?: string | null;
    license?: string | null;
    author?: string | null;
    attribution?: string | null;
  },
): Promise<void> {
  if (!urls.length) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("park_media").insert(
    urls.map((url) => ({
      park_id: parkId,
      url,
      user_id: opts.userId ?? null,
      category: "other" as const,
      status: "approved" as const,
      source: opts.source,
      license: opts.license ?? null,
      author: opts.author ?? null,
      attribution: opts.attribution ?? null,
    })),
  );
  if (error) throw error;
}

/** Remove a park photo by its URL (back-office photo management works from the
 * flat `park.photos` URL list rather than media ids). */
export async function deleteMediaByUrl(parkId: string, url: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("park_media").delete().eq("park_id", parkId).eq("url", url);
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
