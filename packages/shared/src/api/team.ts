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

/** Une collectivité par id (Admin-UI-3C — fiche 360). `null` si l'id
 * n'existe pas ou n'est pas visible (RLS) — jamais distingué, même principe
 * que `getParkEditWithDetails`. */
export async function getOrganization(id: string): Promise<Organization | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Organization | null;
}

export async function updateCommune(id: string, patch: Partial<Organization>): Promise<Organization> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("organizations").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as Organization;
}

export const listOrganizations = listCommunes;
export const updateOrganization = updateCommune;

export interface OrganizationWithCounts extends Organization {
  /** Nombre de parcs rattachés (`organization_parks`, lecture publique —
   * policy `organization_parks_read` = `using (true)`, vérifié). */
  parkCount: number;
}

/**
 * Liste Admin des collectivités (Admin-UI-3B) : `organizations` enrichi du
 * nombre de parcs rattachés, en 2 requêtes au total (pas de N+1 — même
 * principe que `listParkEditsWithDetails`).
 *
 * Pas de compteur « membres » ici, délibérément : la policy `team_read`
 * (migration 0002, jamais étendue depuis) n'autorise un membre du staff à
 * lire que ses propres lignes, les lignes staff (`organization_id is null`)
 * et celles de SA PROPRE organisation s'il en est membre — `commune_role()`/
 * `org_role()` n'ont aucune clause de bypass staff. Un admin ne peut donc pas
 * compter fiablement les membres d'une collectivité dont il ne fait pas
 * partie ; un compteur basé sur une lecture non scopée de `team_members`
 * afficherait silencieusement 0 pour la plupart des collectivités alors que
 * des membres existent réellement. Décision produit (Admin-UI-3B) : retirer
 * la colonne plutôt qu'afficher un chiffre potentiellement faux — nécessite
 * une policy RLS dédiée (migration) pour être ajouté correctement plus tard.
 */
export async function listOrganizationsWithCounts(): Promise<OrganizationWithCounts[]> {
  const supabase = getSupabase();
  const [orgsRes, orgParksRes] = await Promise.all([
    supabase.from("organizations").select("*").order("name"),
    supabase.from("organization_parks").select("organization_id"),
  ]);
  if (orgsRes.error) throw orgsRes.error;
  if (orgParksRes.error) throw orgParksRes.error;

  const parkCounts = new Map<string, number>();
  for (const row of (orgParksRes.data ?? []) as { organization_id: string }[]) {
    parkCounts.set(row.organization_id, (parkCounts.get(row.organization_id) ?? 0) + 1);
  }

  return ((orgsRes.data ?? []) as Organization[]).map((org) => ({
    ...org,
    parkCount: parkCounts.get(org.id) ?? 0,
  }));
}
