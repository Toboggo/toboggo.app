import { getSupabase } from "../supabaseClient";

/**
 * Structured community-feed event. The presentation layer (the consumer app's
 * Activity screen) turns `kind` + `params` into a localized sentence and picks
 * an icon — this module never builds user-facing copy.
 */
export type CommunityFeedItem = { id: string; time: string } & (
  | { kind: "park_added"; params: { park: string } }
  | { kind: "review_added"; params: { author: string; rating: number; park: string | null } }
  | { kind: "report_resolved"; params: { park: string | null } }
);

/** Public "what's happening" feed for the consumer app — recently published
 * parks, new reviews, and resolved reports, merged client-side rather than a
 * dedicated table (the commune-scoped activity_log is a separate, internal
 * back-office audit trail — see api/notifications.ts). */
export async function getCommunityActivity(limit = 20): Promise<CommunityFeedItem[]> {
  const supabase = getSupabase();
  const [{ data: parks }, { data: reviews }, { data: reports }] = await Promise.all([
    supabase.from("parks").select("id,name,created_at").eq("moderation_status", "published").order("created_at", { ascending: false }).limit(limit),
    supabase.from("reviews").select("id,author_name,rating,created_at,parks(name)").eq("status", "published").order("created_at", { ascending: false }).limit(limit),
    supabase
      .from("reports")
      .select("id,resolved_at,parks(name)")
      .eq("status", "resolved")
      .order("resolved_at", { ascending: false })
      .limit(limit),
  ]);

  const items: CommunityFeedItem[] = [
    ...(parks ?? []).map(
      (p): CommunityFeedItem => ({ id: `park-${p.id}`, kind: "park_added", time: p.created_at, params: { park: p.name } }),
    ),
    ...(reviews ?? []).map(
      (r: any): CommunityFeedItem => ({
        id: `review-${r.id}`,
        kind: "review_added",
        time: r.created_at,
        params: { author: r.author_name, rating: r.rating, park: r.parks?.name ?? null },
      }),
    ),
    ...(reports ?? []).map(
      (r: any): CommunityFeedItem => ({
        id: `report-${r.id}`,
        kind: "report_resolved",
        time: r.resolved_at,
        params: { park: r.parks?.name ?? null },
      }),
    ),
  ];

  return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, limit);
}
