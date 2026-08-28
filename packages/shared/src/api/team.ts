import { getSupabase } from "../supabaseClient";
import type { Organization, TeamMember, TeamRole } from "../types";

/** Add the deprecated `commune_id` alias so existing back-office code keeps working. */
function hydrate(row: Record<string, unknown>): TeamMember {
  const r = row as unknown as TeamMember;
  return { ...r, commune_id: r.organization_id ?? null };
}

export async function listTeam(communeId: string | null): Promise<TeamMember[]> {
  const supabase = getSupabase();
  let query = supabase.from("team_members").select("*").order("created_at", { ascending: true });
  query = communeId ? query.eq("organization_id", communeId) : query.is("organization_id", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(hydrate);
}

export async function getMyRole(userId: string, communeId: string | null): Promise<TeamMember | null> {
  const supabase = getSupabase();
  let query = supabase.from("team_members").select("*").eq("user_id", userId);
  query = communeId ? query.eq("organization_id", communeId) : query.is("organization_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? hydrate(data) : null;
}

export async function inviteTeamMember(input: {
  communeId: string | null;
  name: string;
  email: string;
  role: TeamRole;
  invitedBy: string;
}): Promise<TeamMember> {
  const supabase = getSupabase();
  const { error: authError } = await supabase.auth.signInWithOtp({ email: input.email });
  if (authError) throw authError;
  const { data, error } = await supabase
    .from("team_members")
    .insert({
      organization_id: input.communeId,
      name: input.name,
      email: input.email,
      role: input.role,
      invited_by: input.invitedBy,
      user_id: null,
    })
    .select()
    .single();
  if (error) throw error;
  return hydrate(data);
}

export async function removeTeamMember(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("team_members").delete().eq("id", id);
  if (error) throw error;
}

// ── Organisations (formerly "communes") ──────────────────────────────────
export async function listCommunes(): Promise<Organization[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("organizations").select("*").order("name");
  if (error) throw error;
  return data as Organization[];
}

export async function updateCommune(id: string, patch: Partial<Organization>): Promise<Organization> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("organizations").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as Organization;
}

export const listOrganizations = listCommunes;
export const updateOrganization = updateCommune;
