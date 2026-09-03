import { getSupabase } from "../supabaseClient";
import { deleteParkPhotoFile } from "../utils/storage";
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

/** A contributor upload (`source = "user"`) always lands in the moderation
 * queue; a trusted source (collectivité / Toboggo staff) is published directly.
 * Mirrors the `park_media_insert` RLS policy (migration 0027). */
function defaultMediaStatus(source: NonNullable<ParkMedia["source"]>): ParkMedia["status"] {
  return source === "user" ? "pending" : "approved";
}

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
 *
 * `status` defaults to the moderation rule (0027): a contributor photo
 * (`source = "user"`) is `pending`; a collectivité / Toboggo photo is
 * `approved`. Pass `status` explicitly only to override.
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
      status: input.status ?? defaultMediaStatus(input.source),
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
 * batch). Each becomes a `park_media` row with recorded provenance. `status`
 * follows the moderation rule (0027): `pending` for a contributor, `approved`
 * for a collectivité / Toboggo source, unless overridden. */
export async function addParkPhotos(
  parkId: string,
  urls: string[],
  opts: {
    source: NonNullable<ParkMedia["source"]>;
    userId?: string | null;
    license?: string | null;
    author?: string | null;
    attribution?: string | null;
    status?: ParkMedia["status"];
  },
): Promise<void> {
  if (!urls.length) return;
  const supabase = getSupabase();
  const status = opts.status ?? defaultMediaStatus(opts.source);
  const { error } = await supabase.from("park_media").insert(
    urls.map((url) => ({
      park_id: parkId,
      url,
      user_id: opts.userId ?? null,
      category: "other" as const,
      status,
      source: opts.source,
      license: opts.license ?? null,
      author: opts.author ?? null,
      attribution: opts.attribution ?? null,
    })),
  );
  if (error) throw error;
}

// ── §15 Media — modération (0027) ────────────────────────────────────────

export interface PendingMedia extends ParkMedia {
  park: { id: string; name: string; commune_id: string | null } | null;
}

/** Photos awaiting moderation. Scoped to a commune when `communeId` is given
 * (a collectivité only moderates photos on its own parks); Toboggo staff pass
 * nothing and see everything. */
export async function listPendingMedia(opts: { communeId?: string } = {}): Promise<PendingMedia[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_media")
    .select("*, park:parks!park_media_park_id_fkey(id, name, commune_id)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  let rows = (data ?? []) as unknown as PendingMedia[];
  if (opts.communeId) rows = rows.filter((r) => r.park?.commune_id === opts.communeId);
  return rows;
}

/** Approve or reject a photo. A rejected photo's file is purged from the public
 * bucket (the row is kept, its `url` now points nowhere) so refused content
 * never stays reachable. */
export async function setMediaStatus(id: string, status: "approved" | "rejected"): Promise<void> {
  const supabase = getSupabase();
  const { data: row, error: readErr } = await supabase
    .from("park_media")
    .select("url")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;

  const { error } = await supabase.from("park_media").update({ status }).eq("id", id);
  if (error) throw error;

  if (status === "rejected" && row?.url) await deleteParkPhotoFile(row.url);
}

/** Set the cover photo of a park. Clears any previous cover first — the partial
 * unique index `park_media_one_cover` guarantees at most one cover per park, so
 * a partial failure can never leave two. */
export async function setParkCover(parkId: string, mediaId: string): Promise<void> {
  const supabase = getSupabase();
  const { error: clearErr } = await supabase
    .from("park_media")
    .update({ is_cover: false })
    .eq("park_id", parkId)
    .eq("is_cover", true);
  if (clearErr) throw clearErr;
  const { error } = await supabase.from("park_media").update({ is_cover: true }).eq("id", mediaId);
  if (error) throw error;
}

/** Delete one photo by id, purging its file. */
export async function deleteMedia(id: string): Promise<void> {
  const supabase = getSupabase();
  const { data: row, error: readErr } = await supabase
    .from("park_media")
    .select("url")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error } = await supabase.from("park_media").delete().eq("id", id);
  if (error) throw error;
  if (row?.url) await deleteParkPhotoFile(row.url);
}

/** Remove a park photo by its URL (back-office photo management works from the
 * flat `park.photos` URL list rather than media ids). Also purges the file. */
export async function deleteMediaByUrl(parkId: string, url: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("park_media").delete().eq("park_id", parkId).eq("url", url);
  if (error) throw error;
  await deleteParkPhotoFile(url);
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
