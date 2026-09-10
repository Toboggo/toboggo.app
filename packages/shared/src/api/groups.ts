import { getSupabase } from "../supabaseClient";
import type { GroupMember, GroupOuting } from "../types";

/**
 * `group_members.status` values.
 *
 * These fixed French literals act as a de-facto enum: they are the only values
 * ever written (`createGroup` / `joinGroup` below), `updateMemberStatus` is
 * currently unused, and the sole reader (`GroupOuting.tsx`) maps them to the
 * active locale for display. Kept as-is on purpose — no stored value changes,
 * no migration — see the mapping in `GroupOuting.tsx`.
 */
const MEMBER_STATUS = { organizer: "Organisateur", enRoute: "En route" } as const;

function genCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

export async function createGroup(parkId: string, userId: string, organizerName: string): Promise<GroupOuting> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("groups")
    .insert({ park_id: parkId, code: genCode(), created_by: userId, active: true })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("group_members").insert({ group_id: data.id, name: organizerName, status: MEMBER_STATUS.organizer });
  return data as GroupOuting;
}

export async function joinGroup(code: string, name: string): Promise<GroupOuting | null> {
  const supabase = getSupabase();
  const { data: group, error } = await supabase
    .from("groups")
    .select("*")
    .eq("code", code.toUpperCase())
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!group) return null;
  await supabase.from("group_members").insert({ group_id: group.id, name, status: MEMBER_STATUS.enRoute });
  return group as GroupOuting;
}

export async function getMyActiveGroup(userId: string): Promise<GroupOuting | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .eq("created_by", userId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as GroupOuting | null;
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("group_members").select("*").eq("group_id", groupId);
  if (error) throw error;
  return data as GroupMember[];
}

export async function leaveGroup(groupId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("groups").update({ active: false }).eq("id", groupId);
  if (error) throw error;
}

export async function updateMemberStatus(memberId: string, status: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("group_members").update({ status }).eq("id", memberId);
  if (error) throw error;
}
