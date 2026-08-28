import { getSupabase } from "../supabaseClient";
import type { Report, ReportStatus } from "../types";

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
  let query = supabase.from("reports").select("*, parks!inner(name)").order("created_at", { ascending: false });
  if (opts.communeId) {
    const { data: orgParks } = await supabase
      .from("organization_parks")
      .select("park_id")
      .eq("organization_id", opts.communeId);
    const ids = (orgParks ?? []).map((r: { park_id: string }) => r.park_id);
    query = query.in("park_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  if (opts.status?.length) query = query.in("status", opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const h = hydrate(row) as Report & { parks?: { name: string } };
    h.parks = (row as { parks?: { name: string } }).parks;
    return h;
  }) as unknown as Report[];
}

export async function listMyReports(userId: string): Promise<(Report & { parks: { name: string } })[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reports")
    .select("*, parks(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const h = hydrate(row) as Report & { parks: { name: string } };
    h.parks = (row as { parks: { name: string } }).parks;
    return h;
  });
}

type CreateReportInput = Partial<Report> & { park_id: string; reported_by_name: string };

export async function createReport(input: CreateReportInput): Promise<Report> {
  const supabase = getSupabase();
  const row = {
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
    status: "open" as const,
  };
  const { data, error } = await supabase.from("reports").insert(row).select().single();
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
