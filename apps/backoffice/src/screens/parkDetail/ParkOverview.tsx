import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listParkEdits,
  listReportsForPark,
  listSources,
  REPORT_REASON_LABEL,
  REPORT_SEVERITY_LABEL,
  type Park,
  type ParkSource,
  type Report,
} from "@toboggo/shared";
import { Icon } from "@toboggo/design-system";
import { CountBadge, Panel, PanelEmpty } from "../../components/Panel";
import { ReportModal } from "../../components/ReportModal";
import { ReportStatusTag } from "../../components/StatusTag";
import { computeCompleteness, type CompletenessKey } from "../../lib/parkCompleteness";
import { queryClient } from "../../lib/queryClient";
import { relativeTime } from "../../lib/relativeTime";
import { SOURCE_LABEL } from "../../lib/sourceLabels";
import styles from "./ParkOverview.module.css";

export type OverviewTab = "info" | "features" | "photos";

/** Where each missing information is filled in. */
const TAB_FOR: Record<CompletenessKey, OverviewTab> = {
  address: "info",
  ages: "info",
  description: "info",
  photo: "photos",
  features: "features",
};

const VERIFICATION_TEXT: Record<Park["verification_status"], string> = {
  unverified: "Non vérifié",
  community_verified: "Vérifié par la communauté",
  organization_verified: "Vérifié par la collectivité",
  toboggo_verified: "Vérifié par Toboggo",
};

const MAX_REPORTS = 5;

/** « OpenStreetMap · ODbL » — the provider name is dropped when it only repeats the type label. */
function sourceLine(s: ParkSource): string {
  const label = SOURCE_LABEL[s.source_type] ?? s.source_type;
  const name = s.source_name && s.source_name.trim().toLowerCase() !== label.toLowerCase() ? s.source_name : null;
  return [label, name, s.license].filter(Boolean).join(" · ");
}
const isActive = (r: Report) => r.status === "open" || r.status === "in_progress";

/**
 * Collectivité-only overview (COLL-03C), shown above the detail tabs: what is
 * missing, what awaits a check, the linked reports and where the data comes
 * from. Everything is derived from existing rows — nothing is stored or invented.
 */
export function ParkOverview({
  park,
  canResolveReport,
  canEdit,
  onOpenTab,
}: {
  park: Park;
  canResolveReport: boolean;
  canEdit: boolean;
  onOpenTab: (tab: OverviewTab) => void;
}) {
  const [selected, setSelected] = useState<Report | null>(null);
  const completeness = computeCompleteness(park);

  const reportsQ = useQuery({ queryKey: ["park-reports", park.id], queryFn: () => listReportsForPark(park.id) });
  const editsQ = useQuery({
    queryKey: ["park-pending-edits", park.id],
    queryFn: () => listParkEdits({ parkId: park.id, status: ["pending"] }),
  });
  const sourcesQ = useQuery({ queryKey: ["park-sources", park.id], queryFn: () => listSources(park.id) });

  // `ReportModal` only invalidates the global report/park lists; this panel's own
  // queries (and `has_open_report` on the park) must be refreshed once it closes.
  function closeReport() {
    setSelected(null);
    for (const key of [["park-reports", park.id], ["park", park.id]]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const reports = reportsQ.data ?? [];
  const activeReports = reports.filter(isActive);
  // Open first, then most recent — the list is already newest-first.
  const shown = [...activeReports, ...reports.filter((r) => !isActive(r))].slice(0, MAX_REPORTS);
  const pendingEdits = editsQ.data?.length ?? 0;
  const sources = sourcesQ.data ?? [];

  return (
    <div className={styles.grid}>
      <Panel
        title="État du parc"
        icon="ic-check"
        action={
          <span className={styles.progress}>
            {completeness.filled}/{completeness.total} renseignées
          </span>
        }
      >
        <ul className={styles.checklist}>
          {completeness.items.map((item) => (
            <li key={item.key} className={styles.checkItem}>
              <span className={item.done ? styles.done : styles.todo} aria-hidden="true">
                {item.done ? <Icon name="ic-check" size={12} /> : "·"}
              </span>
              <span className={styles.checkLabel}>{item.label}</span>
              {item.done ? (
                <span className={styles.ok}>Renseignée</span>
              ) : canEdit ? (
                <button type="button" className={styles.link} onClick={() => onOpenTab(TAB_FOR[item.key])}>
                  À compléter
                </button>
              ) : (
                <span className={styles.muted}>À compléter</span>
              )}
            </li>
          ))}
        </ul>

        <dl className={styles.facts}>
          <div>
            <dt>Vérification</dt>
            <dd>
              {VERIFICATION_TEXT[park.verification_status]}
              {park.last_verified_at ? ` · ${relativeTime(park.last_verified_at)}` : ""}
            </dd>
          </div>
          <div>
            <dt>Propositions à vérifier</dt>
            <dd>
              {editsQ.isError ? (
                <span className={styles.muted}>Indisponible</span>
              ) : pendingEdits > 0 ? (
                <span className={styles.alertLine}>
                  <CountBadge>{pendingEdits}</CountBadge>
                  {pendingEdits > 1 ? "modifications proposées" : "modification proposée"}
                </span>
              ) : (
                "Aucune"
              )}
            </dd>
          </div>
          <div>
            <dt>Source des données</dt>
            <dd>
              {sourcesQ.isError ? (
                <span className={styles.muted}>Indisponible</span>
              ) : sources.length === 0 ? (
                <span className={styles.muted}>Non renseignée</span>
              ) : (
                <ul className={styles.sources}>
                  {sources.map((s) => (
                    <li key={s.id}>
                      {sourceLine(s)}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel
        title="Signalements"
        icon="ic-flag"
        action={activeReports.length > 0 ? <CountBadge>{activeReports.length}</CountBadge> : undefined}
      >
        {reportsQ.isLoading ? (
          <p className={styles.muted}>Chargement…</p>
        ) : reportsQ.isError ? (
          <p className={styles.muted}>Impossible de charger les signalements.</p>
        ) : shown.length === 0 ? (
          <PanelEmpty icon="ic-check" text="Aucun signalement sur ce parc." />
        ) : (
          <ul className={styles.reports}>
            {shown.map((r) => (
              <li key={r.id}>
                <button type="button" className={styles.reportRow} onClick={() => setSelected(r)}>
                  <span className={styles.reportMain}>
                    <span className={styles.reportTitle}>{REPORT_REASON_LABEL[r.category] ?? r.category}</span>
                    <span className={styles.reportMeta} title={new Date(r.created_at).toLocaleString("fr-FR")}>
                      {REPORT_SEVERITY_LABEL[r.severity]} · {relativeTime(r.created_at)}
                    </span>
                  </span>
                  <ReportStatusTag status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {reports.length > shown.length && (
          <p className={styles.more}>+ {reports.length - shown.length} autre(s) signalement(s) plus ancien(s)</p>
        )}
      </Panel>

      <ReportModal report={selected} parkName={park.name} onClose={closeReport} canManage={canResolveReport} />
    </div>
  );
}
