import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listParks, listPendingParkEditsForOrg, type Park, type ParkEdit, type ParkStatus } from "@toboggo/shared";
import { computeCompleteness, type Completeness } from "./parkCompleteness";

/**
 * Data layer of the collectivité "Mes parcs" (COLL-03B). A collectivité's
 * patrimoine is small (tens of parks, 12 for the Lyon dataset), so — like the
 * Dashboard — it loads the whole list once and filters / sorts / paginates in
 * memory: the "à compléter" and "infos à vérifier" filters are derived values
 * the server cannot filter on. Everything here is a pure function of real rows.
 */
export interface ParkRow {
  park: Park;
  completeness: Completeness;
  /** Pending `park_edits` proposals on this park. */
  pendingEdits: number;
  /** `park_public.has_open_report`. */
  openReport: boolean;
}

export function buildParkRows(parks: Park[], pendingEdits: ParkEdit[]): ParkRow[] {
  const editsByPark = new Map<string, number>();
  for (const edit of pendingEdits) {
    if (edit.park_id) editsByPark.set(edit.park_id, (editsByPark.get(edit.park_id) ?? 0) + 1);
  }
  return parks.map((park) => ({
    park,
    completeness: computeCompleteness(park),
    pendingEdits: editsByPark.get(park.id) ?? 0,
    openReport: !!park.has_open_report,
  }));
}

export interface ParkFilters {
  q: string;
  status: ParkStatus | "all";
  report: boolean;
  incomplete: boolean;
  edits: boolean;
}

export const NO_FILTERS: ParkFilters = { q: "", status: "all", report: false, incomplete: false, edits: false };

export function hasActiveFilters(f: ParkFilters): boolean {
  return f.q !== "" || f.status !== "all" || f.report || f.incomplete || f.edits;
}

/** Lower-case, accent-insensitive — « Genin » must find « Génin ». */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function searchHaystack(park: Park): string {
  return normalizeText(
    [park.name, park.address_line, park.postal_code, park.city, park.formatted_address].filter(Boolean).join(" "),
  );
}

export function filterParkRows(rows: ParkRow[], f: ParkFilters): ParkRow[] {
  const q = normalizeText(f.q.trim());
  return rows.filter(
    (r) =>
      (f.status === "all" || r.park.status === f.status) &&
      (!f.report || r.openReport) &&
      (!f.incomplete || r.completeness.missing.length > 0) &&
      (!f.edits || r.pendingEdits > 0) &&
      (!q || searchHaystack(r.park).includes(q)),
  );
}

export type CommuneSortKey = "name" | "updated_at";

export function sortParkRows(rows: ParkRow[], key: CommuneSortKey, order: "asc" | "desc"): ParkRow[] {
  const dir = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp =
      key === "name"
        ? a.park.name.localeCompare(b.park.name, "fr", { sensitivity: "base" })
        : new Date(a.park.updated_at).getTime() - new Date(b.park.updated_at).getTime();
    return cmp !== 0 ? cmp * dir : a.park.id.localeCompare(b.park.id);
  });
}

export interface ParksSummary {
  total: number;
  published: number;
  withOpenReport: number;
  incomplete: number;
  /** Sum of every missing information across parks. */
  missingTotal: number;
  pendingEdits: number;
  parksWithEdits: number;
}

export function summarizeParks(rows: ParkRow[]): ParksSummary {
  return {
    total: rows.length,
    published: rows.filter((r) => r.park.status === "published").length,
    withOpenReport: rows.filter((r) => r.openReport).length,
    incomplete: rows.filter((r) => r.completeness.missing.length > 0).length,
    missingTotal: rows.reduce((sum, r) => sum + r.completeness.missing.length, 0),
    pendingEdits: rows.reduce((sum, r) => sum + r.pendingEdits, 0),
    parksWithEdits: rows.filter((r) => r.pendingEdits > 0).length,
  };
}

export const COMMUNE_PAGE_SIZE = 25;

export function paginate<T>(items: T[], page: number, pageSize = COMMUNE_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageCount };
}

export function useCommuneParks(communeId: string | undefined) {
  const parksQ = useQuery({
    queryKey: ["bo-parks", communeId],
    queryFn: () => listParks({ communeId }),
    enabled: !!communeId,
  });
  const editsQ = useQuery({
    queryKey: ["bo-parks-pending-edits", communeId],
    queryFn: () => listPendingParkEditsForOrg(communeId!),
    enabled: !!communeId,
  });

  const rows = useMemo(
    () => (parksQ.data ? buildParkRows(parksQ.data, editsQ.data ?? []) : []),
    [parksQ.data, editsQ.data],
  );

  return {
    rows,
    isLoading: parksQ.isLoading || editsQ.isLoading,
    isError: parksQ.isError,
    /** The parks loaded but the proposals could not: their counts are unknown, not zero. */
    editsUnavailable: editsQ.isError,
    refetch: () => {
      void parksQ.refetch();
      void editsQ.refetch();
    },
  };
}
