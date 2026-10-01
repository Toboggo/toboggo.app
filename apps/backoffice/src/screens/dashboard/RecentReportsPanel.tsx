import { useNavigate } from "react-router-dom";
import { Button } from "@toboggo/design-system";
import { REPORT_REASON_LABEL, type Report } from "@toboggo/shared";
import { ReportStatusTag } from "../../components/StatusTag";
import { Panel, PanelEmpty } from "../../components/Panel";
import { relativeTime } from "../../lib/relativeTime";
import styles from "../Dashboard.module.css";

const MAX_ROWS = 5;

export function RecentReportsPanel({ reports }: { reports: (Report & { parks?: { name: string } })[] }) {
  const navigate = useNavigate();
  const recent = reports.slice(0, MAX_ROWS);

  return (
    <Panel
      title="Signalements récents"
      icon="ic-flag"
      action={
        reports.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => navigate("/reports")}>
            Voir tout
          </Button>
        )
      }
    >
      {recent.length === 0 ? (
        <PanelEmpty icon="ic-flag" text="Aucun signalement récent." />
      ) : (
        <ul className={styles.panelList}>
          {recent.map((r) => (
            <li key={r.id} className={styles.panelRow}>
              {r.photo && <img className={styles.panelThumb} src={r.photo} alt="" />}
              <div className={styles.panelRowBody}>
                <div className={styles.panelRowTitle}>
                  {r.parks?.name ?? "Parc"} <span className={styles.panelRowMuted}>· {REPORT_REASON_LABEL[r.category]}</span>
                </div>
                <div className={styles.panelRowMeta}>
                  <time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString("fr-FR")}>
                    {relativeTime(r.created_at)}
                  </time>
                </div>
              </div>
              <ReportStatusTag status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
