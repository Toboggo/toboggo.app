import { getSupabase } from "../supabaseClient";
import type { ActivityLogEntry, AppNotification } from "../types";

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as AppNotification[];
}

export async function markNotificationRead(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}

export async function logActivity(communeId: string | null, actor: string, text: string, color = "primary") {
  const supabase = getSupabase();
  await supabase.from("activity_log").insert({ organization_id: communeId, actor, text, color });
}

export async function listActivity(communeId: string | null, limit = 200): Promise<ActivityLogEntry[]> {
  const supabase = getSupabase();
  let query = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit);
  query = communeId ? query.eq("organization_id", communeId) : query.is("organization_id", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...(r as ActivityLogEntry), commune_id: (r as ActivityLogEntry).organization_id }));
}
