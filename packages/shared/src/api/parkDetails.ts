import { getSupabase } from "../supabaseClient";
import { listOrgParkIds } from "./parks";
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
  SourceType,
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

export interface ParkSourceCount {
  source_type: SourceType;
  count: number;
}

/**
 * Répartition du catalogue par `park_sources.source_type` (Admin-UI-2 —
 * Dashboard §3), toutes organisations confondues. `park_sources` a
 * aujourd'hui exactement une ligne par parc (vérifié en lecture seule :
 * `park_id` n'est pas unique en base mais chaque import n'en crée qu'une —
 * un parc avec 0 ou 2+ lignes reste géré ici sans planter, juste compté
 * différemment). RLS `park_sources_read` = `park_is_visible(park_id)` :
 * un admin/staff voit tous les parcs (staff manages_park), donc cet agrégat
 * porte sur le catalogue réel, pas seulement les parcs publiés.
 */
export async function getParkSourceDistribution(): Promise<ParkSourceCount[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_sources").select("source_type");
  if (error) throw error;
  const counts = new Map<SourceType, number>();
  for (const row of (data ?? []) as { source_type: SourceType }[]) {
    counts.set(row.source_type, (counts.get(row.source_type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source_type, count]) => ({ source_type, count }))
    .sort((a, b) => b.count - a.count);
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
  park: { id: string; name: string } | null;
  /** Nom du profil de l'auteur (`user_id` → `profiles.name`), pour une photo
   * de contributeur sans `author` déclaré. `null` si le contributeur n'a pas
   * de profil, ou si `profiles` n'est pas lisible par l'appelant (RLS
   * `profiles_staff_read` : vrai pour le staff, pas pour une collectivité) —
   * jamais un nom inventé (même convention que `proposedByName` dans
   * `listParkEditsWithDetails`, contributions.ts). */
  uploadedByName: string | null;
}

/** Résout `user_id` → `profiles.name` pour un lot de `park_media`, en UNE
 * requête batched (jamais un lookup par ligne) — même pattern que
 * `listParkEditsWithDetails` (contributions.ts). */
async function withUploaderNames<T extends ParkMedia>(rows: T[]): Promise<(T & { uploadedByName: string | null })[]> {
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))];
  if (!userIds.length) return rows.map((r) => ({ ...r, uploadedByName: null }));
  const supabase = getSupabase();
  const { data: profiles, error } = await supabase.from("profiles").select("id, name").in("id", userIds);
  if (error) throw error;
  const namesById = new Map<string, string>();
  for (const p of (profiles ?? []) as { id: string; name: string }[]) namesById.set(p.id, p.name);
  return rows.map((r) => ({ ...r, uploadedByName: r.user_id ? (namesById.get(r.user_id) ?? null) : null }));
}

/** Photos awaiting moderation. Scoped to a commune when `communeId` is given
 * (a collectivité only moderates photos on its own parks); Toboggo staff pass
 * nothing and see everything. Scoped server-side via `organization_parks`
 * (like `listParks`/`listReports`/`listReviews`) rather than the legacy
 * `parks.commune_id` column, so a park created through the back office is
 * moderated by its own collectivité from the moment it exists. */
export async function listPendingMedia(opts: { communeId?: string } = {}): Promise<PendingMedia[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("park_media")
    .select("*, park:parks!park_media_park_id_fkey(id, name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (opts.communeId) {
    const ids = await listOrgParkIds(opts.communeId);
    query = query.in("park_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data, error } = await query;
  if (error) throw error;
  return withUploaderNames((data ?? []) as unknown as (ParkMedia & { park: { id: string; name: string } | null })[]);
}

/**
 * Photos déjà modérées (approuvées ou refusées) — alimente l'onglet
 * "Traitées" de `/photos` (Admin-UI-6D). Même scoping que `listPendingMedia`.
 *
 * Limite backend constatée : `park_media` n'a pas de colonne
 * `moderated_at`/`moderated_by` — le tri se fait donc sur `created_at`
 * (date d'ENVOI de la photo), pas sur la date de décision de modération, qui
 * n'est pas enregistrée aujourd'hui. Contrairement à `listPendingMedia`
 * (toujours petite par construction), cette file n'est bornée par aucune
 * fenêtre de temps ni pagination — à revisiter si son volume grandit au point
 * de le justifier ; non fait ici pour ne pas inventer une limite arbitraire
 * non demandée.
 */
export async function listProcessedMedia(opts: { communeId?: string } = {}): Promise<PendingMedia[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("park_media")
    .select("*, park:parks!park_media_park_id_fkey(id, name)")
    .in("status", ["approved", "rejected"])
    .order("created_at", { ascending: false });
  if (opts.communeId) {
    const ids = await listOrgParkIds(opts.communeId);
    query = query.in("park_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data, error } = await query;
  if (error) throw error;
  return withUploaderNames((data ?? []) as unknown as (ParkMedia & { park: { id: string; name: string } | null })[]);
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
