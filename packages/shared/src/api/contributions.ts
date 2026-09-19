import { getSupabase } from "../supabaseClient";
import { listOrgParkIds } from "./parks";
import type { EditStatus, Json, ParkEdit, ParkEditReviewDecision, ParkEditReviewResult, ParkEditWithDetails } from "../types";

/**
 * §13 — Contributions / change-requests. Parents propose; canonical `parks`
 * data is only written by the owning organisation's team or Toboggo staff.
 */
export async function submitParkEdit(input: {
  parkId: string | null;
  userId: string;
  changes: Json;
  organizationId?: string | null;
}): Promise<ParkEdit> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_edits")
    .insert({
      park_id: input.parkId,
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      changes: input.changes,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as ParkEdit;
}

export async function listParkEdits(opts: { parkId?: string; status?: ParkEdit["status"][] } = {}): Promise<ParkEdit[]> {
  const supabase = getSupabase();
  let query = supabase.from("park_edits").select("*").order("created_at", { ascending: false });
  if (opts.parkId) query = query.eq("park_id", opts.parkId);
  if (opts.status?.length) query = query.in("status", opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ParkEdit[];
}

/**
 * Pending change-request proposals ("infos à vérifier") for a collectivité's
 * own parks. `park_edits` has no `organization_id`-scoped read policy of its
 * own to rely on client-side, so this cross-references `listOrgParkIds` (the
 * same organisation → park-id resolution used for parks/reports/reviews/
 * pending media since Lot 1) rather than trusting `park_edits.organization_id`,
 * which is optional and not always set at submission time.
 */
export async function listPendingParkEditsForOrg(organizationId: string): Promise<ParkEdit[]> {
  const parkIds = await listOrgParkIds(organizationId);
  if (!parkIds.length) return [];
  const pending = await listParkEdits({ status: ["pending"] });
  return pending.filter((edit) => edit.park_id != null && parkIds.includes(edit.park_id));
}

/**
 * File de validation (Admin-3B-1) : `park_edits` enrichis du nom du parc et
 * de l'auteur, en **2 requêtes au total** quel que soit le nombre de lignes —
 * jamais un `getPark()`/lookup par ligne (N+1) :
 *   1. `park_edits` + `parks(name, formatted_address)` en un seul `select`
 *      embarqué (FK réelle `park_edits_park_id_fkey`, même mécanisme déjà
 *      utilisé par `listReports`) ;
 *   2. un unique `profiles.select(...).in("id", …)` sur les `user_id`
 *      distincts de la page, plutôt qu'un appel par proposition.
 * `parks` est `null` (pas `!inner`) car `park_id` est nullable — une
 * proposition sans parc reste listée. `proposedByName` est `null` si
 * `profiles` n'est pas lisible pour l'appelant (RLS `profiles_staff_read` :
 * vrai pour le staff, pas pour une collectivité) — jamais un nom inventé.
 *
 * `parkId` (Admin-UI-5D — onglet "Modifications proposées" de la fiche Parc
 * 360) restreint à un seul parc, en réutilisant le même enrichissement
 * auteur/parc plutôt que dupliquer la logique dans un second endpoint.
 */
export async function listParkEditsWithDetails(
  opts: { status?: EditStatus[]; parkId?: string } = {},
): Promise<ParkEditWithDetails[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("park_edits")
    .select("*, parks(name, formatted_address)")
    .order("created_at", { ascending: false });
  if (opts.status?.length) query = query.in("status", opts.status);
  if (opts.parkId) query = query.eq("park_id", opts.parkId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as (ParkEdit & { parks: { name: string; formatted_address: string | null } | null })[];

  const userIds = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))];
  const namesById = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, name").in("id", userIds);
    if (profilesError) throw profilesError;
    for (const p of (profiles ?? []) as { id: string; name: string }[]) namesById.set(p.id, p.name);
  }

  return rows.map((r) => ({ ...r, proposedByName: r.user_id ? (namesById.get(r.user_id) ?? null) : null }));
}

/** Une proposition unique, même enrichissement que `listParkEditsWithDetails`
 * (parc + auteur) — pour l'écran de détail (Admin-3B-1, lecture seule). */
export async function getParkEditWithDetails(id: string): Promise<ParkEditWithDetails | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("park_edits")
    .select("*, parks(name, formatted_address)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ParkEdit & { parks: { name: string; formatted_address: string | null } | null };

  let proposedByName: string | null = null;
  if (row.user_id) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", row.user_id)
      .maybeSingle();
    if (profileError) throw profileError;
    proposedByName = profile?.name ?? null;
  }

  return { ...row, proposedByName };
}

/**
 * Accepte ou rejette une proposition `park_edits` — SEULE voie applicative
 * pour cette action (Admin-3A). Appelle exclusivement la RPC transactionnelle
 * `review_park_edit` (migration 0037) : aucune écriture directe sur
 * `park_edits`/`parks`/`park_features` ici, la RPC garantit à elle seule la
 * comparaison live (A/B/C), l'application réelle, le statut final et
 * l'atomicité (tout ou rien en cas d'erreur technique).
 *
 * Pas de `reviewerId` en paramètre : le reviewer est déterminé côté DB par
 * `auth.uid()`, jamais fourni par le client (0037, §PERMISSIONS).
 *
 * `requires_manual_review` et `already_reviewed` sont des résultats MÉTIER
 * normaux (retournés, pas levés en exception) — seule une vraie erreur
 * (permissions, type de proposition non supporté, décision invalide, échec
 * SQL) rejette la promesse, via le `throw error` habituel des wrappers de ce
 * fichier.
 */
export async function reviewParkEdit(
  editId: string,
  decision: ParkEditReviewDecision,
  note?: string,
): Promise<ParkEditReviewResult> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("review_park_edit", {
    p_edit_id: editId,
    p_decision: decision,
    // Omis plutôt que `null` si absent — même convention que `findDuplicateParks`
    // ci-dessous : le type `Args` généré (`p_note?: string`) rejette `null`.
    ...(note ? { p_note: note } : {}),
  });
  if (error) throw error;
  return data as ParkEditReviewResult;
}

// ── §11 Worldwide de-duplication ────────────────────────────────────────
export interface DuplicateCandidate {
  park_id: string;
  name: string;
  distance_m: number;
  name_similarity: number;
  score: number;
}

/** Call before creating a park: geo distance + trigram name similarity.
 * Never dedupe on name alone (§11). */
export async function findDuplicateParks(
  lat: number,
  lng: number,
  name: string,
  radiusM = 200,
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("find_duplicate_parks", {
    p_lat: lat,
    p_lng: lng,
    p_name: name,
    p_radius_m: radiusM,
    // `p_exclude` is an optional arg (defaults to NULL server-side); omit it
    // rather than passing an explicit null the generated Args type rejects.
    ...(excludeId ? { p_exclude: excludeId } : {}),
  });
  if (error) throw error;
  return (data ?? []) as DuplicateCandidate[];
}

// ── §14 Audit log ──────────────────────────────────────────────────────
export async function listAuditLog(entityType: string, entityId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
