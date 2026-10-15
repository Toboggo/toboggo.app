import { getSupabase } from "../supabaseClient";
import { orgParkScopeSelect, ORG_PARK_SCOPE_PATH } from "./parks";
import type { Report, ReportStatus } from "../types";
import type { TablesInsert } from "../types/database.types";

/**
 * `reports.reason` is a V1-coexistence column: NOT NULL, no DEFAULT, mirrored
 * from `category` by the `reports_v1_compat` BEFORE INSERT trigger
 * (supabase/migrations/0014_v2_reports.sql — see database-migration.md §9).
 * The generated types still mark it required, so we build the canonical V2 row
 * (`category` only) and make one narrow adaptation at the `.insert()` call site.
 */
type ReportInsertV2 = Omit<TablesInsert<"reports">, "reason">;

function hydrate(row: Record<string, unknown>): Report {
  const r = row as unknown as Report;
  return { ...r, reason: r.category, equipment: r.equipment_label ?? null, comment: r.description ?? null };
}

export async function listReportsForPark(parkId: string): Promise<Report[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("park_id", parkId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(hydrate);
}

export async function listReports(opts: { communeId?: string; status?: ReportStatus[] } = {}): Promise<Report[]> {
  const supabase = getSupabase();
  // Périmètre de collectivité : jointure serveur `parks → organization_parks` (pas de liste d'ids).
  const select: string = `*, parks!inner(name, formatted_address${orgParkScopeSelect(opts.communeId)})`;
  let query = supabase
    .from("reports")
    .select(select)
    .order("created_at", { ascending: false });
  if (opts.communeId) query = query.eq(`parks.${ORG_PARK_SCOPE_PATH}`, opts.communeId);
  if (opts.status?.length) query = query.in("status", opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Parameters<typeof hydrate>[0][]).map((row) => {
    const h = hydrate(row) as Report & { parks?: { name: string } };
    const parks = (row as { parks?: { name: string } }).parks;
    h.parks = parks ? { name: parks.name } : parks;
    return h;
  }) as unknown as Report[];
}

export async function listMyReports(
  userId: string,
): Promise<(Report & { parks: { name: string; city: string | null } })[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reports")
    .select("*, parks(name, city)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const h = hydrate(row) as Report & { parks: { name: string; city: string | null } };
    h.parks = (row as { parks: { name: string; city: string | null } }).parks;
    return h;
  });
}

type CreateReportInput = Partial<Report> & { park_id: string; reported_by_name: string };

export async function createReport(input: CreateReportInput): Promise<Report> {
  const supabase = getSupabase();
  const row: ReportInsertV2 = {
    park_id: input.park_id,
    zone_id: input.zone_id ?? null,
    equipment_id: input.equipment_id ?? null,
    user_id: input.user_id ?? null,
    reported_by_name: input.reported_by_name,
    category: input.category ?? input.reason ?? "other",
    severity: input.severity ?? "medium",
    equipment_label: input.equipment_label ?? input.equipment ?? null,
    description: input.description ?? input.comment ?? null,
    photo: input.photo ?? null,
    status: "open",
  };
  // `reason` is filled by the reports_v1_compat trigger (see ReportInsertV2).
  const { data, error } = await supabase
    .from("reports")
    .insert(row as TablesInsert<"reports">)
    .select()
    .single();
  if (error) throw error;
  return hydrate(data);
}

export async function resolveReport(id: string, note: string, photo?: string) {
  const supabase = getSupabase();
  const { data: existing } = await supabase.from("reports").select("created_at").eq("id", id).single();
  const days = existing
    ? Math.max(1, Math.round((Date.now() - new Date(existing.created_at).getTime()) / 86400000))
    : null;
  const { error } = await supabase
    .from("reports")
    .update({
      status: "resolved",
      resolution_note: note,
      resolution_photo: photo ?? null,
      resolution_days: days,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function dismissReport(id: string, note: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("reports")
    .update({ status: "dismissed", resolution_note: note, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function reopenReport(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("reports").update({ status: "open", resolved_at: null }).eq("id", id);
  if (error) throw error;
}
