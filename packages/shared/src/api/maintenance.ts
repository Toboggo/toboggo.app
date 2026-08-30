import { getSupabase } from "../supabaseClient";
import type { Maintenance } from "../types";
import type { Tables, TablesInsert, TablesUpdate } from "../types/database.types";

/**
 * `maintenance.commune_id` is a V1-coexistence column: NOT NULL, no DEFAULT,
 * kept in sync by the `maintenance_v1_compat` BEFORE INSERT/UPDATE trigger,
 * which mirrors it from `organization_id`
 * (supabase/migrations/0016_v2_organization_columns.sql — see database-migration.md §9).
 * The generated Supabase types still mark it required because they can't see
 * the trigger, so the repository builds a canonical V2 payload (organization_id
 * only) and makes a single narrow adaptation at the `.insert()` call site.
 */
type MaintenanceInsertV2 = Omit<TablesInsert<"maintenance">, "commune_id">;
type MaintenanceUpdateV2 = Omit<TablesUpdate<"maintenance">, "commune_id">;

function hydrate(row: Tables<"maintenance">): Maintenance {
  return { ...row, commune_id: row.organization_id };
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

/** Canonical V2 insert payload: `organization_id` resolved, legacy `commune_id` left to the trigger. */
function toInsertRow(input: MaintenanceInput): MaintenanceInsertV2 {
  const { commune_id, organization_id, ...rest } = input;
  const organizationId = organization_id ?? commune_id;
  if (!organizationId) {
    throw new Error("createMaintenance : organization_id (ou commune_id) est requis");
  }
  return { ...rest, organization_id: organizationId };
}

/** Canonical V2 update payload: map `commune_id` → `organization_id` when supplied, drop the legacy key. */
function toUpdateRow(patch: Partial<Maintenance>): MaintenanceUpdateV2 {
  const { commune_id, organization_id, ...rest } = patch;
  const organizationId = organization_id ?? commune_id;
  return organizationId != null ? { ...rest, organization_id: organizationId } : rest;
}

export async function createMaintenance(input: MaintenanceInput): Promise<Maintenance> {
  const supabase = getSupabase();
  const row: MaintenanceInsertV2 = { ...toInsertRow(input), done: false };
  const { data, error } = await supabase
    .from("maintenance")
    // `commune_id` is filled by the maintenance_v1_compat trigger (see above).
    .insert(row as TablesInsert<"maintenance">)
    .select()
    .single();
  if (error) throw error;
  return hydrate(data);
}

export async function updateMaintenance(id: string, patch: Partial<Maintenance>): Promise<Maintenance> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("maintenance")
    .update(toUpdateRow(patch))
    .eq("id", id)
    .select()
    .single();
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
