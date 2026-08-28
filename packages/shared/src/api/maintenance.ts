import { getSupabase } from "../supabaseClient";
import type { Maintenance } from "../types";

function hydrate(row: Record<string, unknown>): Maintenance {
  const r = row as unknown as Maintenance;
  return { ...r, commune_id: r.organization_id };
}

export async function listMaintenance(communeId: string): Promise<Maintenance[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("maintenance")
    .select("*")
    .eq("organization_id", communeId)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(hydrate);
}

type MaintenanceInput = Omit<
  Maintenance,
  "id" | "created_at" | "done" | "done_date" | "commune_id" | "organization_id" | "zone_id" | "equipment_id"
> & {
  commune_id?: string;
  organization_id?: string;
  zone_id?: string | null;
  equipment_id?: string | null;
};

function toRow(input: Partial<MaintenanceInput>): Record<string, unknown> {
  const { commune_id, organization_id, ...rest } = input as Record<string, unknown>;
  return { ...rest, organization_id: organization_id ?? commune_id };
}

export async function createMaintenance(input: MaintenanceInput): Promise<Maintenance> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("maintenance")
    .insert({ ...toRow(input), done: false })
    .select()
    .single();
  if (error) throw error;
  return hydrate(data);
}

export async function updateMaintenance(id: string, patch: Partial<Maintenance>): Promise<Maintenance> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("maintenance").update(toRow(patch)).eq("id", id).select().single();
  if (error) throw error;
  return hydrate(data);
}

export async function completeMaintenance(item: Maintenance): Promise<Maintenance> {
  const supabase = getSupabase();
  const doneDate = new Date().toISOString();
  const { data, error } = await supabase
    .from("maintenance")
    .update({ done: true, done_date: doneDate })
    .eq("id", item.id)
    .select()
    .single();
  if (error) throw error;

  if (item.recur !== "none") {
    const next = new Date(item.date);
    if (item.recur === "monthly") next.setMonth(next.getMonth() + 1);
    else next.setFullYear(next.getFullYear() + 1);
    await createMaintenance({
      park_id: item.park_id,
      organization_id: item.organization_id,
      commune_id: item.organization_id,
      zone_id: item.zone_id ?? null,
      equipment_id: item.equipment_id ?? null,
      date: next.toISOString().slice(0, 10),
      note: item.note,
      assignee: item.assignee,
      recur: item.recur,
    });
  }
  return hydrate(data);
}

export async function deleteMaintenance(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("maintenance").delete().eq("id", id);
  if (error) throw error;
}
