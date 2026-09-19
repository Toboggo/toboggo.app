import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, DataTable, type DataTableColumn } from "@toboggo/design-system";
import { listReportsForPark, REPORT_REASON_LABEL, type Report } from "@toboggo/shared";
import { ReportModal, type ReportWithPark } from "../../components/ReportModal";
import { ReportSeverityTag, ReportStatusTag } from "../../components/StatusTag";
import { usePermissions } from "../../lib/permissions";
import { queryClient } from "../../lib/queryClient";
import styles from "../ParkDetail.module.css";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

// Fait ressortir ouvert/critique en triant dessus — jamais une priorité
// inventée, seulement les 2 colonnes réelles déjà affichées (statut, sévérité).
const SEVERITY_RANK: Record<Report["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function ReportsPanel({ parkId, parkName }: { parkId: string; parkName: string }) {
  const { canResolveReport } = usePermissions();
  const [selected, setSelected] = useState<ReportWithPark | null>(null);

  const { data: reports = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["park-reports", parkId],
    queryFn: () => listReportsForPark(parkId),
  });

  const sorted = useMemo(
    () =>
      [...reports].sort((a, b) => {
        const openDiff = Number(b.status === "open") - Number(a.status === "open");
        if (openDiff !== 0) return openDiff;
        const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [reports],
  );

  const columns: DataTableColumn<Report>[] = [
    { key: "category", header: "Motif", render: (r) => REPORT_REASON_LABEL[r.category] },
    { key: "severity", header: "Sévérité", width: "1px", render: (r) => <ReportSeverityTag severity={r.severity} /> },
    { key: "status", header: "Statut", width: "1px", render: (r) => <ReportStatusTag status={r.status} /> },
    {
      key: "created_at",
      header: "Date",
      width: "1px",
      align: "right",
      render: (r) => <span className={styles.date}>{dateFmt.format(new Date(r.created_at))}</span>,
    },
    { key: "action", header: "", width: "1px", align: "right", render: () => <span className={styles.viewAffordance}>Voir</span> },
  ];

  return (
    <div className={styles.panel}>
      <DataTable
        caption={`Signalements — ${parkName}`}
        columns={columns}
        rows={sorted}
        getRowKey={(r) => r.id}
        onRowClick={setSelected}
        rowLabel={(r) => `Ouvrir le signalement — ${REPORT_REASON_LABEL[r.category]}`}
        state={isError ? "error" : isLoading ? "loading" : "ready"}
        loadingRows={3}
        error={
          <>
            <p>Impossible de charger les signalements.</p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              Réessayer
            </Button>
          </>
        }
        empty={<p>Aucun signalement pour ce parc.</p>}
      />

      {selected && (
        <ReportModal
          report={selected}
          parkName={parkName}
          canManage={canResolveReport}
          onClose={() => {
            setSelected(null);
            // ReportModal invalidates ["bo-reports"] (l'écran /reports), pas
            // cette clé scopée au parc — revalidée ici pour que la liste de
            // cet onglet reflète immédiatement une résolution/un rejet.
            void queryClient.invalidateQueries({ queryKey: ["park-reports", parkId] });
          }}
        />
      )}
    </div>
  );
}
