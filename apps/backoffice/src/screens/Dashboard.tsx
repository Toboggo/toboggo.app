import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, Icon } from "@toboggo/design-system";
import {
  listParks,
  listReports,
  listReviews,
  listActivity,
  listPendingMedia,
  listMaintenance,
  listPendingParkEditsForOrg,
  type Maintenance,
} from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";
import styles from "./Dashboard.module.css";

const UPCOMING_MAINTENANCE_WINDOW_DAYS = 7;

function isUpcoming(item: Maintenance): boolean {
  if (item.done) return false;
  const dayStart = new Date(new Date().toDateString()).getTime();
  const windowEnd = dayStart + UPCOMING_MAINTENANCE_WINDOW_DAYS * 86400000;
  const date = new Date(item.date).getTime();
  return date >= dayStart && date <= windowEnd;
}

interface ActionItem {
  key: string;
  label: string;
  count: number;
  onClick?: () => void;
  hint?: string;
}

interface StatItem {
  key: string;
  value: number;
  label: string;
  onClick: () => void;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, communeId } = useOrgScope();

  const { data: parks = [] } = useQuery({ queryKey: ["dash-parks", communeId], queryFn: () => listParks({ communeId }) });
  const { data: reports = [] } = useQuery({ queryKey: ["dash-reports", communeId], queryFn: () => listReports({ communeId }) });
  const { data: reviews = [] } = useQuery({ queryKey: ["dash-reviews", communeId], queryFn: () => listReviews({ communeId }) });
  const { data: activity = [] } = useQuery({ queryKey: ["dash-activity", communeId, isAdmin], queryFn: () => listActivity(isAdmin ? null : communeId!) });
  const { data: pendingMedia = [] } = useQuery({
    queryKey: ["dash-pending-media", communeId],
    queryFn: () => listPendingMedia({ communeId }),
  });
  // Collectivité only: no cross-organisation "entretien" or "infos à
  // vérifier" screen exists yet for the admin context (hors scope Lot 2).
  const { data: maintenance = [] } = useQuery({
    queryKey: ["dash-maintenance", communeId],
    queryFn: () => listMaintenance(communeId!),
    enabled: !isAdmin && !!communeId,
  });
  const { data: pendingEdits = [] } = useQuery({
    queryKey: ["dash-pending-edits", communeId],
    queryFn: () => listPendingParkEditsForOrg(communeId!),
    enabled: !isAdmin && !!communeId,
  });

  const published = parks.filter((p) => p.status === "published").length;
  const pending = parks.filter((p) => p.status === "pending").length;
  const blocked = parks.filter((p) => p.status === "blocked").length;
  const openReports = reports.filter((r) => r.status === "open").length;
  const lowReviews = reviews.filter((r) => r.stars <= 2).length;
  const upcomingMaintenance = maintenance.filter(isUpcoming).length;

  const actionItems: ActionItem[] = (
    isAdmin
      ? [
          { key: "parks", label: "Parcs en attente de validation", count: pending, onClick: () => navigate("/parks?status=pending") },
          { key: "reports", label: "Signalements ouverts", count: openReports, onClick: () => navigate("/reports") },
        ]
      : [
          { key: "reports", label: "Signalements ouverts", count: openReports, onClick: () => navigate("/reports") },
          { key: "media", label: "Photos en attente", count: pendingMedia.length, onClick: () => navigate("/photos") },
          // No dedicated screen exists yet (Lot 6) — the volume is shown honestly,
          // without pretending there is somewhere real to click through to.
          { key: "edits", label: "Infos à vérifier", count: pendingEdits.length, hint: "Écran dédié à venir" },
          { key: "maintenance", label: "Entretien à venir", count: upcomingMaintenance, onClick: () => navigate("/maintenance") },
        ]
  ).filter((item) => item.count > 0);

  const stats: StatItem[] = isAdmin
    ? [
        { key: "active", value: published, label: "Parcs actifs", onClick: () => navigate("/parks") },
        { key: "media", value: pendingMedia.length, label: "Photos en attente", onClick: () => navigate("/photos") },
        { key: "reviews", value: reviews.length, label: "Avis publiés", onClick: () => navigate("/reviews") },
        { key: "reports", value: openReports, label: "Signalements ouverts", onClick: () => navigate("/reports") },
      ]
    : [
        { key: "published", value: published, label: "Publiés", onClick: () => navigate("/parks?status=published") },
        { key: "pending", value: pending, label: "En attente", onClick: () => navigate("/parks?status=pending") },
        { key: "blocked", value: blocked, label: "Bloqués", onClick: () => navigate("/parks?status=blocked") },
        { key: "total", value: parks.length, label: "Total", onClick: () => navigate("/parks?status=all") },
      ];

  return (
    <div>
      <PageHeader title="Tableau de bord" />

      <div className={styles.stack}>
        <Card flat>
          <h2 className={styles.sectionTitle}>À traiter</h2>
          {actionItems.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="ic-check" size={18} />
              </span>
              Rien ne nécessite votre attention pour le moment.
            </div>
          ) : (
            <div className={styles.actionList}>
              {actionItems.map((item) => {
                const content = (
                  <>
                    <span className={styles.actionLabel}>
                      {item.label}
                      {item.hint && <span className={styles.actionHint}>{item.hint}</span>}
                    </span>
                    <span className={styles.countBadge}>{item.count}</span>
                  </>
                );
                return item.onClick ? (
                  <button key={item.key} type="button" className={styles.actionRow} onClick={item.onClick}>
                    {content}
                  </button>
                ) : (
                  <div key={item.key} className={`${styles.actionRow} ${styles.static}`}>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card flat>
          <div className={styles.statStripLabel}>{isAdmin ? "Vue d'ensemble" : "Mes parcs"}</div>
          <div className={styles.statStrip}>
            {stats.map((stat) => (
              <button key={stat.key} type="button" className={styles.stat} onClick={stat.onClick}>
                <span className={styles.statValue}>{stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card flat>
          <h2 className={styles.sectionTitle}>Activité récente</h2>
          <ActivityList activity={activity} />
          {!isAdmin && lowReviews > 0 && (
            <button type="button" className={styles.actionRow} onClick={() => navigate("/reviews")} style={{ marginTop: 8 }}>
              <span className={styles.actionLabel}>Avis ≤2★ à examiner</span>
              <span className={styles.countBadge}>{lowReviews}</span>
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}

function ActivityList({ activity }: { activity: { id: string; text: string; actor: string; created_at: string }[] }) {
  if (activity.length === 0) {
    return <p className={styles.activityEmpty}>Aucune activité enregistrée.</p>;
  }
  return (
    <>
      {activity.slice(0, 8).map((a) => (
        <div key={a.id} className={styles.activityRow}>
          <span className={styles.activityDot} />
          <div>
            <div className={styles.activityText}>{a.text}</div>
            <div className={styles.activityMeta}>
              {a.actor} · {new Date(a.created_at).toLocaleString("fr-FR")}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
