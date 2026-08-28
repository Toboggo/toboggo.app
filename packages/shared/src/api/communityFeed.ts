import { getSupabase } from "../supabaseClient";

export interface FeedItem {
  id: string;
  icon: string;
  text: string;
  time: string;
}

/** Public "what's happening" feed for the consumer app — recently published
 * parks, new reviews, and resolved reports, merged client-side rather than a
 * dedicated table (the commune-scoped activity_log is a separate, internal
 * back-office audit trail — see api/notifications.ts). */
export async function getCommunityActivity(limit = 20): Promise<FeedItem[]> {
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

  const items: FeedItem[] = [
    ...(parks ?? []).map((p) => ({ id: `park-${p.id}`, icon: "🛝", text: `Nouveau parc ajouté : ${p.name}`, time: p.created_at })),
    ...(reviews ?? []).map((r: any) => ({
      id: `review-${r.id}`,
      icon: "⭐",
      text: `${r.author_name} a laissé un avis ${r.rating}★ sur ${r.parks?.name ?? "un parc"}`,
      time: r.created_at,
    })),
    ...(reports ?? []).map((r: any) => ({
      id: `report-${r.id}`,
      icon: "✅",
      text: `Un signalement a été résolu sur ${r.parks?.name ?? "un parc"}`,
      time: r.resolved_at,
    })),
  ];

  return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, limit);
}
