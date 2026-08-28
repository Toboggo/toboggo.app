import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Segmented, Button } from "@toboggo/design-system";
import { listReports, toCsv, downloadCsv, REPORT_REASON_LABEL, type Report, type ReportStatus } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ReportStatusTag } from "../components/StatusTag";
import { ReportModal } from "../components/ReportModal";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";

type TabValue = "open" | "resolved" | "dismissed" | "all";

export default function Reports() {
  const { isAdmin, communeId } = useOrgScope();
  const canManage = isAdmin || useOrgSession((s) => s.isGestionnaireOrAbove());
  const [tab, setTab] = useState<TabValue>("open");
  const [selected, setSelected] = useState<(Report & { parks?: { name: string } }) | null>(null);

  const { data: reports = [] } = useQuery({ queryKey: ["bo-reports", communeId], queryFn: () => listReports({ communeId }) });
  const filtered = tab === "all" ? reports : reports.filter((r) => r.status === (tab as ReportStatus));

  const tabs: { value: TabValue; label: string }[] = [
    { value: "open", label: `Ouverts (${reports.filter((r) => r.status === "open").length})` },
    { value: "resolved", label: "Résolus" },
    { value: "dismissed", label: "Ignorés" },
    { value: "all", label: "Tous" },
  ];

  function exportCsv() {
    const csv = toCsv(
      filtered.map((r: any) => ({ Parc: r.parks?.name, Motif: REPORT_REASON_LABEL[r.reason as keyof typeof REPORT_REASON_LABEL], Statut: r.status, Date: r.created_at })),
      ["Parc", "Motif", "Statut", "Date"],
    );
    downloadCsv("toboggo-signalements.csv", csv);
  }

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
      <Segmented options={tabs} value={tab} onChange={(v) => setTab(v as TabValue)} />

      <div style={{ marginTop: 16 }}>
        {filtered.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>Aucun signalement dans cette catégorie.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((r: any) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: "var(--color-surface)", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <div>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>{r.parks?.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                    {REPORT_REASON_LABEL[r.reason as keyof typeof REPORT_REASON_LABEL]} · signalé {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <ReportStatusTag status={r.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <ReportModal report={selected} onClose={() => setSelected(null)} canManage={canManage} />}
    </div>
  );
}
