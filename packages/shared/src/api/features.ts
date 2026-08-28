import { getSupabase } from "../supabaseClient";
import type { Feature, FeatureStatus, ParkFeature } from "../types";

/** §3 — the universal feature catalogue. Small and stable; cache in memory. */
let cache: Feature[] | null = null;

export async function listFeatures(force = false): Promise<Feature[]> {
  if (cache && !force) return cache;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("features")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  cache = data as Feature[];
  return cache;
}

export async function listParkFeatures(parkId: string): Promise<ParkFeature[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("park_features").select("*").eq("park_id", parkId);
  if (error) throw error;
  return (data ?? []) as ParkFeature[];
}

/** §4 — set/clear a feature on a park (available / unavailable / unknown / …). */
export async function setParkFeature(
  parkId: string,
  featureId: string,
  status: FeatureStatus,
  opts: { value?: string | null; quantity?: number | null; note?: string | null } = {},
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("park_features").upsert(
    {
      park_id: parkId,
      feature_id: featureId,
      status,
      value: opts.value ?? null,
      quantity: opts.quantity ?? null,
      note: opts.note ?? null,
      verified_at: status === "available" || status === "unavailable" ? new Date().toISOString() : null,
    },
    { onConflict: "park_id,feature_id" },
  );
  if (error) throw error;
}

export async function removeParkFeature(parkId: string, featureId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("park_features")
    .delete()
    .eq("park_id", parkId)
    .eq("feature_id", featureId);
  if (error) throw error;
}
