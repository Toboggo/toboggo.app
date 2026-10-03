import { getSupabase } from "../supabaseClient";
import { listOrgParkIds } from "./parks";
import type { AgeBand, Review, ReviewSubRatings } from "../types";
import type { TablesInsert, TablesUpdate } from "../types/database.types";

/**
 * `reviews.stars` is a V1-coexistence column: NOT NULL, no DEFAULT, mirrored
 * from `rating` by the `reviews_v1_compat` BEFORE INSERT trigger
 * (supabase/migrations/0013_v2_reviews.sql — see database-migration.md §9).
 * The generated types still mark it required, so we build the canonical V2 row
 * (`rating` only) and make one narrow adaptation at the `.insert()` call site.
 */
type ReviewInsertV2 = Omit<TablesInsert<"reviews">, "stars">;

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
    const ids = await listOrgParkIds(opts.communeId);
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

export async function listMyReviews(
  userId: string,
): Promise<(Review & { parks: { name: string; city: string | null } })[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reviews")
    .select("*, parks(name, city)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const h = hydrate(row) as Review & { parks: { name: string; city: string | null } };
    h.parks = (row as { parks: { name: string; city: string | null } }).parks;
    return h;
  });
}

/**
 * Whether `userId` has published a review of `parkId`. Existence check only:
 * `count` + `head` (no row payload), served by the park/user indexes.
 */
export async function hasUserReviewedPark(userId: string, parkId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("park_id", parkId)
    .eq("user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

type CreateReviewInput =Partial<Review> & { park_id: string; user_id: string; author_name: string };

export async function createReview(input: CreateReviewInput): Promise<Review> {
  const supabase = getSupabase();
  const rating = input.rating ?? input.stars ?? 0;
  const sub = input.sub_ratings;
  const [rMin, rMax] = input.age_band ? AGE_BAND_RANGE[input.age_band] : [input.recommended_min_age ?? null, input.recommended_max_age ?? null];
  const row: ReviewInsertV2 = {
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
  // `stars` is filled by the reviews_v1_compat trigger (see ReviewInsertV2).
  const { data, error } = await supabase
    .from("reviews")
    .insert(row as TablesInsert<"reviews">)
    .select()
    .single();
  if (error) throw error;
  return hydrate(data);
}

export async function getReview(id: string): Promise<Review | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("reviews").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? hydrate(data) : null;
}

export interface UpdateMyReviewInput {
  stars: number;
  sub_ratings: ReviewSubRatings | null;
  /** `null` ⇒ no age recommendation (both bounds cleared). */
  age_band: AgeBand | null;
  comment: string | null;
}

/**
 * Edits the caller's own review in place (same row — never a second review).
 * Only content columns are written; `created_at` is untouched, `updated_at` is
 * bumped by `reviews_touch`, `edited_at` + the park aggregates by the 0042
 * triggers. Ownership is enforced server-side (RLS `reviews_update_own` +
 * `reviews_author_guard`); the `user_id` filter here is belt-and-braces and
 * makes a non-owner call return no row ⇒ throws, never a silent success.
 */
export async function updateMyReview(id: string, userId: string, input: UpdateMyReviewInput): Promise<Review> {
  const supabase = getSupabase();
  const sub = input.sub_ratings;
  const [rMin, rMax] = input.age_band ? AGE_BAND_RANGE[input.age_band] : [null, null];
  const row: TablesUpdate<"reviews"> = {
    rating: input.stars,
    cleanliness: sub?.clean ?? null,
    safety: sub?.safety ?? null,
    equipment: sub?.equipment ?? null,
    comfort: sub?.comfort ?? null,
    recommended_min_age: rMin,
    recommended_max_age: rMax,
    comment: input.comment,
  };
  const { data, error } = await supabase
    .from("reviews")
    .update(row)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Review not found or not editable");
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
