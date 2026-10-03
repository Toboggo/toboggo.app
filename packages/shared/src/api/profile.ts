import { getSupabase } from "../supabaseClient";
import type { Profile } from "../types";
import { validateUsername } from "../utils/username";

const DEFAULT_PROFILE_FIELDS = {
  children: [] as { age: number }[],
  favorites: [] as string[],
  notif_prefs: { reports: true, newParks: true, reviewReplies: true, recommendations: true, news: false },
  notif_channels: { push: true, email: true },
  privacy_prefs: { shareLocation: true, publicProfile: false },
  dark_mode: false,
  offline_mode: false,
};

/** `name` vide par défaut : le pseudo est choisi par l'utilisateur (jamais déduit de l'e-mail). */
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

/** `name_confirmed_at` est géré par le serveur (migration 0041) : jamais dans un patch client. */
export type ProfilePatch = Partial<Omit<Profile, "name_confirmed_at">>;

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select().single();
  if (error) throw error;
  return data as Profile;
}

/** Erreur de validation serveur du pseudo (contrainte `profiles_name_format`, SQLSTATE 23514). */
export class InvalidUsernameError extends Error {
  constructor() {
    super("invalid_username");
    this.name = "InvalidUsernameError";
  }
}

/**
 * Enregistre le pseudo de l'utilisateur COURANT (RLS `profiles_self_update` :
 * seule sa propre ligne est modifiable). Le client valide d'abord
 * (`validateUsername`), le serveur re-valide (migration 0041) et renseigne
 * `name_confirmed_at`. Retourne la ligne à jour.
 */
export async function setUsername(userId: string, rawName: string): Promise<Profile> {
  const check = validateUsername(rawName);
  if (!check.ok) throw new InvalidUsernameError();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("profiles").update({ name: check.value }).eq("id", userId).select().maybeSingle();
  if (error) {
    if (error.code === "23514") throw new InvalidUsernameError();
    throw error;
  }
  if (!data) throw new Error("profile_not_found");
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
