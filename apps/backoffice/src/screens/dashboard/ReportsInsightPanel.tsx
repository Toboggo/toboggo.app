import { useMemo } from "react";
import type { Report, ReportStatus } from "@toboggo/shared";
import { Panel, PanelEmpty } from "../../components/Panel";
import styles from "../CommuneDashboard.module.css";

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Ouverts",
  in_progress: "En cours",
  resolved: "Résolus",
  dismissed: "Ignorés",
};
const STATUS_CLASS: Record<ReportStatus, string> = {
  open: styles.statusOpen,
  in_progress: styles.statusProgress,
  resolved: styles.statusResolved,
  dismissed: styles.statusDismissed,
};
const STATUSES: ReportStatus[] = ["open", "in_progress", "resolved", "dismissed"];
const WEEKS = 8;

/** Monday-start weekly buckets over the last `WEEKS` weeks, counted from
 * `reports.created_at` — real dates, no synthetic series (COLL-02C §3). */
function weekBuckets(reports: Report[]): { label: string; count: number }[] {
  const dayMs = 86400000;
  const day = new Date().getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date();
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() + mondayOffset);

  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const start = thisMonday.getTime() - (WEEKS - 1 - i) * 7 * dayMs;
    return { start, end: start + 7 * dayMs, count: 0 };
  });
  for (const r of reports) {
    const t = new Date(r.created_at).getTime();
    const bucket = buckets.find((b) => t >= b.start && t < b.end);
    if (bucket) bucket.count++;
  }
  return buckets.map((b) => ({
    label: new Date(b.start).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    count: b.count,
  }));
}

/** Combines "Évolution" and "Répartition par statut" (COLL-02C §3) into one
 * panel rather than two near-empty ones — both read the same already-loaded
 * `reports`, so there is no extra query. Renders nothing chart-like when
 * `reports` is empty: a flat, all-zero chart would misrepresent an unused
 * feature as "no reports this week". */
export function ReportsInsightPanel({ reports }: { reports: Report[] }) {
  const weeks = useMemo(() => weekBuckets(reports), [reports]);
  const maxCount = Math.max(1, ...weeks.map((w) => w.count));
  const byStatus = STATUSES.map((status) => ({ status, count: reports.filter((r) => r.status === status).length }));
  const total = reports.length;

  if (total === 0) {
    return (
      <Panel title="Signalements — vue d'ensemble" icon="ic-flag">
        <PanelEmpty icon="ic-flag" text="Aucun signalement pour le moment." />
      </Panel>
    );
  }

  return (
    <Panel title="Signalements — vue d'ensemble" icon="ic-flag">
      <div className={styles.trendChart} role="img" aria-label={`Évolution des signalements sur les ${WEEKS} dernières semaines`}>
        {weeks.map((w, i) => (
          <div
            key={i}
            className={styles.trendBarWrap}
            title={`Semaine du ${w.label} : ${w.count} signalement${w.count > 1 ? "s" : ""}`}
          >
            <div className={styles.trendBar} style={{ height: `${(w.count / maxCount) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className={styles.trendLabels}>
        <span>{weeks[0].label}</span>
        <span>{weeks[weeks.length - 1].label}</span>
      </div>

      <div
        className={styles.statusBar}
        role="img"
        aria-label={byStatus.map(({ status, count }) => `${STATUS_LABEL[status]} ${count}`).join(", ")}
      >
        {byStatus.map(({ status, count }) => (
          <span key={status} className={STATUS_CLASS[status]} style={{ width: `${(count / total) * 100}%` }} />
        ))}
      </div>
      <div className={styles.statusLegend}>
        {byStatus.map(({ status, count }) => (
          <span key={status} className={styles.statusLegendItem}>
            <span className={`${styles.legendDot} ${STATUS_CLASS[status]}`} />
            {STATUS_LABEL[status]} <strong>{count}</strong>
          </span>
        ))}
      </div>
    </Panel>
  );
}
