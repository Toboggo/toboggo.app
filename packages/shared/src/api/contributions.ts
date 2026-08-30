import { getSupabase } from "../supabaseClient";
import type { Json, ParkEdit } from "../types";

/**
 * §13 — Contributions / change-requests. Parents propose; canonical `parks`
 * data is only written by the owning organisation's team or Toboggo staff.
 */
export async function submitParkEdit(input: {
  parkId: string | null;
  userId: string;
  changes: Json;
  organizationId?: string | null;
}): Promise<ParkEdit> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_edits")
    .insert({
      park_id: input.parkId,
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      changes: input.changes,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as ParkEdit;
}

export async function listParkEdits(opts: { parkId?: string; status?: ParkEdit["status"][] } = {}): Promise<ParkEdit[]> {
  const supabase = getSupabase();
  let query = supabase.from("park_edits").select("*").order("created_at", { ascending: false });
  if (opts.parkId) query = query.eq("park_id", opts.parkId);
  if (opts.status?.length) query = query.in("status", opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ParkEdit[];
}

export async function reviewParkEdit(
  id: string,
  decision: "approved" | "rejected" | "auto_approved",
  reviewerId: string,
  note?: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("park_edits")
    .update({
      status: decision,
      reviewed_by: reviewerId,
      review_note: note ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

// ── §11 Worldwide de-duplication ────────────────────────────────────────
export interface DuplicateCandidate {
  park_id: string;
  name: string;
  distance_m: number;
  name_similarity: number;
  score: number;
}

/** Call before creating a park: geo distance + trigram name similarity.
 * Never dedupe on name alone (§11). */
export async function findDuplicateParks(
  lat: number,
  lng: number,
  name: string,
  radiusM = 200,
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("find_duplicate_parks", {
    p_lat: lat,
    p_lng: lng,
    p_name: name,
    p_radius_m: radiusM,
    // `p_exclude` is an optional arg (defaults to NULL server-side); omit it
    // rather than passing an explicit null the generated Args type rejects.
    ...(excludeId ? { p_exclude: excludeId } : {}),
  });
  if (error) throw error;
  return (data ?? []) as DuplicateCandidate[];
}

// ── §14 Audit log ──────────────────────────────────────────────────────
export async function listAuditLog(entityType: string, entityId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
