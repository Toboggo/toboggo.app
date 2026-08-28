import { getSupabase } from "../supabaseClient";
import type { AgeBand, Review } from "../types";

/** Fill the deprecated compatibility fields on a review row read from the DB. */
function hydrate(row: Record<string, unknown>): Review {
  const r = row as unknown as Review;
  const ageBand: AgeBand | null =
    r.recommended_min_age == null && r.recommended_max_age == null
      ? null
      : (r.recommended_max_age ?? 12) <= 3
        ? "under3"
        : (r.recommended_max_age ?? 12) <= 6
          ? "3-6"
          : (r.recommended_min_age ?? 0) >= 6
            ? "6-12"
            : "all";
  return {
    ...r,
    stars: r.rating,
    flagged: r.status === "flagged",
    age_band: ageBand,
    photo: null,
    sub_ratings:
      r.cleanliness == null && r.safety == null && r.equipment == null && r.comfort == null
        ? null
        : {
            clean: r.cleanliness ?? 0,
            safety: r.safety ?? 0,
            equipment: r.equipment ?? 0,
            comfort: r.comfort ?? 0,
          },
  };
}

const AGE_BAND_RANGE: Record<AgeBand, [number, number]> = {
  all: [0, 12],
  under3: [0, 3],
  "3-6": [3, 6],
  "6-12": [6, 12],
};

export async function listReviewsForPark(parkId: string): Promise<Review[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("park_id", parkId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(hydrate);
}

export async function listReviews(opts: { communeId?: string } = {}): Promise<Review[]> {
  const supabase = getSupabase();
  let query = supabase.from("reviews").select("*, parks!inner(name)").order("created_at", { ascending: false });
  if (opts.communeId) {
    const { data: orgParks } = await supabase
      .from("organization_parks")
      .select("park_id")
      .eq("organization_id", opts.communeId);
    const ids = (orgParks ?? []).map((r: { park_id: string }) => r.park_id);
    query = query.in("park_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const h = hydrate(row) as Review & { parks?: { name: string } };
    h.parks = (row as { parks?: { name: string } }).parks;
    return h;
  }) as unknown as Review[];
}

export async function listMyReviews(userId: string): Promise<(Review & { parks: { name: string } })[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reviews")
    .select("*, parks(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const h = hydrate(row) as Review & { parks: { name: string } };
    h.parks = (row as { parks: { name: string } }).parks;
    return h;
  });
}

type CreateReviewInput = Partial<Review> & { park_id: string; user_id: string; author_name: string };

export async function createReview(input: CreateReviewInput): Promise<Review> {
  const supabase = getSupabase();
  const rating = input.rating ?? input.stars ?? 0;
  const sub = input.sub_ratings;
  const [rMin, rMax] = input.age_band ? AGE_BAND_RANGE[input.age_band] : [input.recommended_min_age ?? null, input.recommended_max_age ?? null];
  const row = {
    park_id: input.park_id,
    user_id: input.user_id,
    author_name: input.author_name,
    rating,
    cleanliness: input.cleanliness ?? sub?.clean ?? null,
    safety: input.safety ?? sub?.safety ?? null,
    equipment: input.equipment ?? sub?.equipment ?? null,
    comfort: input.comfort ?? sub?.comfort ?? null,
    recommended_min_age: rMin,
    recommended_max_age: rMax,
    comment: input.comment ?? null,
  };
  const { data, error } = await supabase.from("reviews").insert(row).select().single();
  if (error) throw error;
  return hydrate(data);
}

export async function flagReview(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("reviews").update({ status: "flagged" }).eq("id", id);
  if (error) throw error;
}

export async function deleteReview(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) throw error;
}

export async function replyToReview(id: string, reply: string, replyBy: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("reviews")
    .update({ reply, reply_by: replyBy, reply_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
