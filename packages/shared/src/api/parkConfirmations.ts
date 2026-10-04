import { getSupabase } from "../supabaseClient";
import type { Feature, Park } from "../types";

/** A park feature the user can be asked to confirm: a REAL recorded value
 * (`available` / `unavailable`) — never a guess. */
export interface ParkVerification {
  park: Park & { distance_m: number };
  feature: Feature;
  status: "available" | "unavailable";
}

/** Features asked about first: concrete, quickly checked on site. */
const CATEGORY_RANK: Record<string, number> = { service: 0, play: 1, accessibility: 2 };
/** A value verified within this window is considered fresh — nothing to ask. */
const FRESH_MS = 180 * 24 * 60 * 60 * 1000;
/** Only the closest parks are considered. */
const MAX_PARKS = 10;

/**
 * The closest nearby parks having a recorded feature worth re-checking (one
 * suggestion per park, nearest first).
 * Pure: `confirmed` = keys `${parkId}:${featureId}` the user already confirmed.
 * Features with an unknown status, or verified recently, are never offered.
 */
export function listParksToVerify(
  parks: (Park & { distance_m: number })[],
  catalogue: Feature[],
  confirmed: ReadonlySet<string>,
  now: number = Date.now(),
): ParkVerification[] {
  const out: ParkVerification[] = [];
  const byCode = new Map(catalogue.map((f) => [f.code, f]));
  const nearest = [...parks].sort((a, b) => a.distance_m - b.distance_m).slice(0, MAX_PARKS);
  for (const park of nearest) {
    let best: { feature: Feature; status: "available" | "unavailable"; rank: number } | null = null;
    for (const [code, view] of Object.entries(park.features)) {
      const feature = byCode.get(code);
      // Valued features (e.g. a surface type) are not a yes/no question.
      if (!feature || (feature.value_set && feature.value_set.length > 0)) continue;
      if (view.status !== "available" && view.status !== "unavailable") continue;
      if (confirmed.has(`${park.id}:${feature.id}`)) continue;
      if (view.verified_at && now - new Date(view.verified_at).getTime() < FRESH_MS) continue;
      const rank = CATEGORY_RANK[feature.category] ?? 3;
      if (!best || rank < best.rank || (rank === best.rank && feature.sort_order < best.feature.sort_order)) {
        best = { feature, status: view.status, rank };
      }
    }
    if (best) out.push({ park, feature: best.feature, status: best.status });
  }
  return out;
}

/** Keys `${parkId}:${featureId}` of everything the user already confirmed (RLS: own rows). */
export async function listMyConfirmationKeys(userId: string): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from("park_confirmations")
    .select("park_id,feature_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => `${r.park_id}:${r.feature_id}`));
}

/** « Oui, c'est bon » — records a confirmation SIGNAL only. It never writes to
 * `park_features` / `parks`: the server (RLS) also refuses a value that differs
 * from the recorded one. Re-confirming is a no-op. */
export async function confirmParkFeature(input: {
  userId: string;
  parkId: string;
  featureId: string;
  status: "available" | "unavailable";
}): Promise<void> {
  const { error } = await getSupabase()
    .from("park_confirmations")
    .upsert(
      { user_id: input.userId, park_id: input.parkId, feature_id: input.featureId, confirmed_status: input.status },
      { onConflict: "user_id,park_id,feature_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

/** Number of confirmations the user has made (for the stats view). */
export async function countMyConfirmations(userId: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("park_confirmations")
    .select("id", { count: "exact" })
    .eq("user_id", userId)
    .limit(1);
  if (error) throw error;
  return count ?? 0;
}
