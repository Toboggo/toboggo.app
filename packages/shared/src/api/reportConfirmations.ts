import { getSupabase } from "../supabaseClient";
import type { ReportCategory, ReportStatus } from "../types";

/** Réponse d'un parent sur place à un signalement précis. */
export type ReportResponse = "still_present" | "resolved";

/**
 * Signalement actif tel qu'exposé PUBLIQUEMENT (RPC `park_active_reports`) :
 * jamais l'auteur, la photo ni les notes de résolution.
 */
export interface ActiveReport {
  id: string;
  category: ReportCategory;
  description: string | null;
  equipment_label: string | null;
  status: ReportStatus;
  created_at: string;
  still_present_count: number;
  resolved_count: number;
  /** Réponse de l'utilisateur courant (null : aucune, ou visiteur). */
  my_response: ReportResponse | null;
}

/** Signalements actifs (open / in_progress) d'un parc publié, plus récents d'abord. */
export async function listActiveReports(parkId: string): Promise<ActiveReport[]> {
  // Le type généré marque description / equipment_label / my_response non
  // nullables (limite du générateur sur les `returns table`) : on re-déclare.
  const { data, error } = await getSupabase().rpc("park_active_reports", { p_park_id: parkId });
  if (error) throw error;
  return (data ?? []) as unknown as ActiveReport[];
}

/**
 * Crée ou modifie la réponse de l'utilisateur connecté (une par signalement).
 * Signal seul : ne clôture JAMAIS le signalement — la modération décide.
 */
export async function respondToReport(reportId: string, response: ReportResponse): Promise<void> {
  const { error } = await getSupabase().rpc("respond_to_report", { p_report_id: reportId, p_response: response });
  if (error) throw error;
}

export interface ReportConfirmationCounts {
  still_present: number;
  resolved: number;
}

/** Agrège des lignes `report_confirmations` par signalement (pur, testable). */
export function countConfirmations(
  rows: { report_id: string; response: string }[],
): Record<string, ReportConfirmationCounts> {
  const out: Record<string, ReportConfirmationCounts> = {};
  for (const row of rows) {
    const entry = (out[row.report_id] ??= { still_present: 0, resolved: 0 });
    if (row.response === "still_present") entry.still_present += 1;
    else if (row.response === "resolved") entry.resolved += 1;
  }
  return out;
}

/** Compteurs par signalement — back-office (RLS : staff Toboggo / gestionnaires du parc). */
export async function listReportConfirmationCounts(
  reportIds: string[],
): Promise<Record<string, ReportConfirmationCounts>> {
  if (reportIds.length === 0) return {};
  const { data, error } = await getSupabase()
    .from("report_confirmations")
    .select("report_id,response")
    .in("report_id", reportIds);
  if (error) throw error;
  return countConfirmations(data ?? []);
}
