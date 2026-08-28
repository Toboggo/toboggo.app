import { getSupabase } from "../supabaseClient";
import type { Profile } from "../types";

const DEFAULT_PROFILE_FIELDS = {
  children: [] as { age: number }[],
  favorites: [] as string[],
  notif_prefs: { reports: true, newParks: true, reviewReplies: true, recommendations: true, news: false },
  notif_channels: { push: true, email: true },
  privacy_prefs: { shareLocation: true, publicProfile: false },
  dark_mode: false,
  offline_mode: false,
};

export async function getOrCreateProfile(userId: string, name: string, email: string): Promise<Profile> {
  const supabase = getSupabase();
  const { data: existing } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (existing) return existing as Profile;
  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: userId, name, email, ...DEFAULT_PROFILE_FIELDS })
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select().single();
  if (error) throw error;
  return data as Profile;
}

export async function listAllUsers(): Promise<Profile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as Profile[];
}

export async function setUserSuspended(userId: string, suspended: boolean) {
  const supabase = getSupabase();
  const { error } = await supabase.from("profiles").update({ suspended }).eq("id", userId);
  if (error) throw error;
}

export async function toggleFavorite(userId: string, parkId: string, favorites: string[]): Promise<string[]> {
  const next = favorites.includes(parkId) ? favorites.filter((f) => f !== parkId) : [...favorites, parkId];
  await updateProfile(userId, { favorites: next });
  return next;
}
