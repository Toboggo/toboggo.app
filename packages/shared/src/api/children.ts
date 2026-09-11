import { getSupabase } from "../supabaseClient";
import type { Child, NewChild } from "../types";

export async function listChildren(parentId: string): Promise<Child[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Child[];
}

/** `parentId` comes from the authenticated session, never from caller input — RLS also enforces this. */
export async function createChild(parentId: string, child: NewChild): Promise<Child> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("children")
    .insert({ parent_id: parentId, ...child })
    .select()
    .single();
  if (error) throw error;
  return data as Child;
}

export async function updateChild(childId: string, patch: NewChild): Promise<Child> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("children").update(patch).eq("id", childId).select().single();
  if (error) throw error;
  return data as Child;
}

export async function deleteChild(childId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("children").delete().eq("id", childId);
  if (error) throw error;
}
