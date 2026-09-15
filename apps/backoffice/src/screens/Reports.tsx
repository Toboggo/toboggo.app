import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, DataTable, Input, Select, type DataTableColumn } from "@toboggo/design-system";
import { listReports, toCsv, downloadCsv, REPORT_REASON_LABEL, type ReportCategory, type ReportStatus } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ReportStatusTag, ReportSeverityTag } from "../components/StatusTag";
import { ReportModal, type ReportWithPark } from "../components/ReportModal";
import { useOrgScope } from "../lib/orgScope";
import { usePermissions } from "../lib/permissions";
import styles from "./Reports.module.css";

const STATUS_VALUES: (ReportStatus | "all")[] = ["all", "open", "in_progress", "resolved", "dismissed"];
const STATUS_LABEL: Record<ReportStatus | "all", string> = {
  all: "Tous les statuts",
  open: "Ouvert",
  in_progress: "En cours",
  resolved: "Résolu",
  dismissed: "Ignoré",
};

const CATEGORY_VALUES: (ReportCategory | "all")[] = [
  "all",
  "broken_equipment",
  "safety",
  "cleanliness",
  "vegetation",
  "accessibility",
  "wrong_info",
  "other",
];
const CATEGORY_LABEL: Record<ReportCategory | "all", string> = {
  all: "Toutes catégories",
  ...REPORT_REASON_LABEL,
};

const DEFAULT_STATUS: ReportStatus | "all" = "open";
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function Reports() {
  const { communeId } = useOrgScope();
  const { canResolveReport } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<ReportWithPark | null>(null);

  const status = (searchParams.get("status") as ReportStatus | "all" | null) ?? DEFAULT_STATUS;
  const category = (searchParams.get("category") as ReportCategory | "all" | null) ?? "all";
  const q = searchParams.get("q")?.trim() ?? "";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const hasActiveFilters = q !== "" || status !== DEFAULT_STATUS || category !== "all";

  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput.trim() !== q) updateParams({ q: qInput.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  function updateParams(next: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    setSearchParams(p, { replace: true });
  }

  function resetFilters() {
    setQInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["bo-reports", communeId],
    queryFn: () => listReports({ communeId }) as Promise<ReportWithPark[]>,
  });
  const reports = data ?? [];

  const filtered = reports
    .filter((r) => status === "all" || r.status === status)
    .filter((r) => category === "all" || r.reason === category)
    .filter((r) => {
      if (!q) return true;
      const needle = q.toLowerCase();
      return (
        (r.parks?.name ?? "").toLowerCase().includes(needle) ||
        r.reported_by_name.toLowerCase().includes(needle) ||
        (r.comment ?? "").toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return order === "asc" ? diff : -diff;
    });

  const openCount = reports.filter((r) => r.status === "open").length;

  function exportCsv() {
    const csv = toCsv(
      filtered.map((r) => ({
        Parc: r.parks?.name ?? "",
        Adresse: r.parks?.formatted_address ?? "",
        Motif: REPORT_REASON_LABEL[r.reason],
        Priorité: r.severity,
        "Signalé par": r.reported_by_name,
        Statut: STATUS_LABEL[r.status],
        Date: r.created_at,
      })),
      ["Parc", "Adresse", "Motif", "Priorité", "Signalé par", "Statut", "Date"],
    );
    downloadCsv("toboggo-signalements.csv", csv);
  }

  const columns: DataTableColumn<ReportWithPark>[] = [
    {
      key: "park",
      header: "Parc",
      render: (r) => (
        <>
          <span className={styles.parkName}>{r.parks?.name ?? "—"}</span>
          <span className={styles.parkMeta}>{r.parks?.formatted_address ?? "Adresse non renseignée"}</span>
        </>
      ),
    },
    {
      key: "reason",
      header: "Motif",
      render: (r) => REPORT_REASON_LABEL[r.reason],
    },
    {
      key: "severity",
      header: "Priorité",
      width: "1px",
      render: (r) => <ReportSeverityTag severity={r.severity} />,
    },
    {
      key: "reported_by",
      header: "Signalé par",
      render: (r) => r.reported_by_name,
    },
    {
      key: "status",
      header: "Statut",
      width: "1px",
      render: (r) => <ReportStatusTag status={r.status} />,
    },
    {
      key: "created_at",
      header: "Créé le",
      width: "1px",
      align: "right",
      sortable: true,
      render: (r) => <span className={styles.date}>{dateFmt.format(new Date(r.created_at))}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Signalements"
        actions={
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            Exporter CSV
          </Button>
        }
      />

      <div className={styles.filterBar}>
        <Input
          className={styles.search}
          label="Rechercher"
          type="search"
          placeholder="Parc, signalant, description…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <Select
          className={styles.select}
          label="Statut"
          value={status}
          onChange={(e) => updateParams({ status: e.target.value === DEFAULT_STATUS ? null : e.target.value })}
        >
          {STATUS_VALUES.map((v) => (
            <option key={v} value={v}>
              {STATUS_LABEL[v]}
              {v === "open" && openCount > 0 ? ` (${openCount})` : ""}
            </option>
          ))}
        </Select>
        <Select
          className={styles.select}
          label="Catégorie"
          value={category}
          onChange={(e) => updateParams({ category: e.target.value === "all" ? null : e.target.value })}
        >
          {CATEGORY_VALUES.map((v) => (
            <option key={v} value={v}>
              {CATEGORY_LABEL[v]}
            </option>
          ))}
        </Select>
        {hasActiveFilters && (
          <button type="button" className={styles.reset} onClick={resetFilters}>
            Réinitialiser
          </button>
        )}
        {!isLoading && !isError && (
          <span className={styles.count}>
            {filtered.length} signalement{filtered.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <DataTable
        caption="Liste des signalements"
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.id}
        onRowClick={setSelected}
        rowLabel={(r) => `Ouvrir le signalement — ${r.parks?.name ?? r.reported_by_name}`}
        sort={{ key: "created_at", order }}
        onSortChange={(next) => updateParams({ order: next.order === "desc" ? null : "asc" })}
        state={isError ? "error" : isLoading ? "loading" : "ready"}
        loadingRows={6}
        error={
          <>
            <p>Impossible de charger les signalements.</p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              Réessayer
            </Button>
          </>
        }
        empty={
          hasActiveFilters ? (
            <>
              <p>Aucun signalement ne correspond à ces critères.</p>
              <Button size="sm" variant="secondary" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            </>
          ) : (
            <p>Aucun signalement dans cette catégorie.</p>
          )
        }
      />

      {selected && <ReportModal report={selected} onClose={() => setSelected(null)} canManage={canResolveReport} />}
    </div>
  );
}
