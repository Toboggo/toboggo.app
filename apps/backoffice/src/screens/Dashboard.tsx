import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon, Skeleton, StatCard, type IconName } from "@toboggo/design-system";
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
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import styles from "./Dashboard.module.css";

const UPCOMING_MAINTENANCE_WINDOW_DAYS = 7;

function isUpcoming(item: Maintenance): boolean {
  if (item.done) return false;
  const dayStart = new Date(new Date().toDateString()).getTime();
  const windowEnd = dayStart + UPCOMING_MAINTENANCE_WINDOW_DAYS * 86400000;
  const date = new Date(item.date).getTime();
  return date >= dayStart && date <= windowEnd;
}

/** Only greets by name when we actually have one — an invited member whose
 * `user_metadata.name` was never set falls back to their e-mail as
 * `userName` (see `orgSession.load`), and "Bonjour jean@mairie.fr" would
 * look broken in front of a prospect. No name worth showing ⇒ no greeting. */
function firstNameOrNull(userName: string): string | null {
  const trimmed = userName.trim();
  if (!trimmed || trimmed.includes("@")) return null;
  return trimmed.split(/\s+/)[0];
}

/** "il y a 3 h" style, with the exact timestamp always available via `title`
 * (hover / screen reader) — never lose the precise date, just lead with the
 * human-readable one. */
function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `il y a ${diffD} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

interface ActionItem {
  key: string;
  label: string;
  count: number;
  icon?: IconName;
  onClick?: () => void;
}

interface KpiItem {
  key: string;
  value: number;
  label: string;
  icon?: IconName;
  tone?: "neutral" | "warning";
  onClick?: () => void;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, communeId } = useOrgScope();
  const { userName } = useOrgSession();

  const parksQ = useQuery({ queryKey: ["dash-parks", communeId], queryFn: () => listParks({ communeId }) });
  const reportsQ = useQuery({ queryKey: ["dash-reports", communeId], queryFn: () => listReports({ communeId }) });
  const reviewsQ = useQuery({ queryKey: ["dash-reviews", communeId], queryFn: () => listReviews({ communeId }) });
  const activityQ = useQuery({ queryKey: ["dash-activity", communeId, isAdmin], queryFn: () => listActivity(isAdmin ? null : communeId!) });
  const pendingMediaQ = useQuery({ queryKey: ["dash-pending-media", communeId], queryFn: () => listPendingMedia({ communeId }) });
  // Collectivité only: no cross-organisation "entretien" or "infos à
  // vérifier" screen exists yet for the admin context (hors scope Lot 2).
  const maintenanceQ = useQuery({
    queryKey: ["dash-maintenance", communeId],
    queryFn: () => listMaintenance(communeId!),
    enabled: !isAdmin && !!communeId,
  });
  const pendingEditsQ = useQuery({
    queryKey: ["dash-pending-edits", communeId],
    queryFn: () => listPendingParkEditsForOrg(communeId!),
    enabled: !isAdmin && !!communeId,
  });

  // `isLoading` (react-query v5) is only true during a query's very first
  // fetch, never on a background refetch — exactly "first paint of this
  // organisation's data", including right after switching org in the
  // sidebar (new queryKey ⇒ a fresh "first" load), which is also when the
  // old 0-then-real-value flash was most visible.
  const loading =
    parksQ.isLoading ||
    reportsQ.isLoading ||
    reviewsQ.isLoading ||
    pendingMediaQ.isLoading ||
    maintenanceQ.isLoading ||
    pendingEditsQ.isLoading;

  if (loading) return <DashboardSkeleton />;

  const parks = parksQ.data ?? [];
  const reports = reportsQ.data ?? [];
  const reviews = reviewsQ.data ?? [];
  const activity = activityQ.data ?? [];
  const pendingMedia = pendingMediaQ.data ?? [];
  const maintenance = maintenanceQ.data ?? [];
  const pendingEdits = pendingEditsQ.data ?? [];

  const published = parks.filter((p) => p.status === "published").length;
  const pending = parks.filter((p) => p.status === "pending").length;
  const blocked = parks.filter((p) => p.status === "blocked").length;
  const openReports = reports.filter((r) => r.status === "open").length;
  const lowReviews = reviews.filter((r) => r.stars <= 2).length;
  const upcomingMaintenance = maintenance.filter(isUpcoming).length;

  const firstName = firstNameOrNull(userName);

  const rawActionItems: ActionItem[] = isAdmin
    ? [
        { key: "parks", label: "Parcs en attente de validation", count: pending, icon: "ic-list", onClick: () => navigate("/parks?status=pending") },
        { key: "reports", label: "Signalements ouverts", count: openReports, icon: "ic-flag", onClick: () => navigate("/reports") },
      ]
    : [
        { key: "reports", label: "Signalements ouverts", count: openReports, icon: "ic-flag", onClick: () => navigate("/reports") },
        { key: "media", label: "Photos à valider", count: pendingMedia.length, onClick: () => navigate("/photos") },
        // No dedicated screen exists yet (Lot 6) — shown as a plain, honest
        // count with no click target, rather than a dead link or a technical
        // caveat a collectivité shouldn't have to read.
        { key: "edits", label: "Informations à vérifier", count: pendingEdits.length, icon: "ic-question" },
        { key: "maintenance", label: "Entretien à venir", count: upcomingMaintenance, onClick: () => navigate("/maintenance") },
      ];
  const actionItems = rawActionItems.filter((item) => item.count > 0);

  const kpis: KpiItem[] = isAdmin
    ? [
        { key: "active", value: published, label: "Parcs actifs", icon: "ic-list", onClick: () => navigate("/parks") },
        { key: "reports", value: openReports, label: "Signalements ouverts", icon: "ic-flag", tone: openReports > 0 ? "warning" : "neutral", onClick: () => navigate("/reports") },
        { key: "media", value: pendingMedia.length, label: "Photos en attente", tone: pendingMedia.length > 0 ? "warning" : "neutral", onClick: () => navigate("/photos") },
        { key: "reviews", value: reviews.length, label: "Avis publiés", icon: "ic-review", onClick: () => navigate("/reviews") },
      ]
    : [
        { key: "parks", value: parks.length, label: "Parcs gérés", icon: "ic-list", onClick: () => navigate("/parks") },
        { key: "reports", value: openReports, label: "Signalements ouverts", icon: "ic-flag", tone: openReports > 0 ? "warning" : "neutral", onClick: () => navigate("/reports") },
        { key: "media", value: pendingMedia.length, label: "Photos à valider", tone: pendingMedia.length > 0 ? "warning" : "neutral", onClick: () => navigate("/photos") },
        { key: "edits", value: pendingEdits.length, label: "Infos à vérifier", icon: "ic-question", tone: pendingEdits.length > 0 ? "warning" : "neutral" },
      ];

  const patrimonyTotal = parks.length || 1;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{firstName ? `Bonjour ${firstName}` : "Tableau de bord"}</h1>
          <p className={styles.subtitle}>Vue d'ensemble de {isAdmin ? "Toboggo Admin" : "votre collectivité"}</p>
        </div>
      </div>

      <div className={styles.kpiStrip}>
        {kpis.map((kpi) => (
          <StatCard key={kpi.key} value={kpi.value} label={kpi.label} icon={kpi.icon} tone={kpi.tone} emphasized onClick={kpi.onClick} />
        ))}
      </div>

      <div className={styles.grid}>
        <div className={`${styles.neutralCard} ${styles.toTreat}`}>
          <h2 className={styles.sectionTitle}>À traiter</h2>
          {actionItems.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="ic-check" size={18} />
              </span>
              Rien ne nécessite votre attention pour le moment — tout est à jour.
            </div>
          ) : (
            <div className={styles.actionList}>
              {actionItems.map((item) => {
                const content = (
                  <>
                    <span className={styles.actionLabel}>
                      {item.icon ? (
                        <span className={styles.actionIcon}>
                          <Icon name={item.icon} size={14} />
                        </span>
                      ) : (
                        <span className={styles.actionIconSlot} aria-hidden="true" />
                      )}
                      <span className={styles.actionText}>{item.label}</span>
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
          {!isAdmin && lowReviews > 0 && (
            <button type="button" className={styles.actionRow} onClick={() => navigate("/reviews")}>
              <span className={styles.actionLabel}>
                <span className={styles.actionIcon}>
                  <Icon name="ic-review" size={14} />
                </span>
                <span className={styles.actionText}>Avis ≤2★ à examiner</span>
              </span>
              <span className={styles.countBadge}>{lowReviews}</span>
            </button>
          )}
        </div>

        <div className={`${styles.neutralCard} ${styles.patrimony}`}>
          <h2 className={styles.sectionTitle}>Patrimoine</h2>
          {parks.length === 0 ? (
            <p className={styles.activityEmpty}>Aucun parc enregistré pour le moment.</p>
          ) : (
            <>
              <div className={styles.patrimonyBar} role="img" aria-label={`${published} parcs publiés, ${pending} en attente, ${blocked} bloqués sur ${parks.length} au total`}>
                <span className={styles.barPublished} style={{ width: `${(published / patrimonyTotal) * 100}%` }} />
                <span className={styles.barPending} style={{ width: `${(pending / patrimonyTotal) * 100}%` }} />
                <span className={styles.barBlocked} style={{ width: `${(blocked / patrimonyTotal) * 100}%` }} />
              </div>
              <div className={styles.patrimonyLegend}>
                <button type="button" className={styles.legendItem} onClick={() => navigate("/parks?status=published")}>
                  <span className={`${styles.legendDot} ${styles.dotPublished}`} />
                  Publiés <strong>{published}</strong>
                </button>
                <button type="button" className={styles.legendItem} onClick={() => navigate("/parks?status=pending")}>
                  <span className={`${styles.legendDot} ${styles.dotPending}`} />
                  En attente <strong>{pending}</strong>
                </button>
                <button type="button" className={styles.legendItem} onClick={() => navigate("/parks?status=blocked")}>
                  <span className={`${styles.legendDot} ${styles.dotBlocked}`} />
                  Bloqués <strong>{blocked}</strong>
                </button>
                <span className={styles.legendTotal}>
                  Total <strong>{parks.length}</strong>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.neutralCard}>
        <h2 className={styles.sectionTitle}>Activité récente</h2>
        <ActivityList activity={activity} />
      </div>
    </div>
  );
}

function ActivityList({ activity }: { activity: { id: string; text: string; actor: string; created_at: string }[] }) {
  if (activity.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>
          <Icon name="ic-list" size={18} />
        </span>
        Aucune activité récente à afficher.
      </div>
    );
  }
  return (
    <>
      {activity.slice(0, 8).map((a) => (
        <div key={a.id} className={styles.activityRow}>
          <span className={styles.activityDot} />
          <div className={styles.activityBody}>
            <div className={styles.activityText}>{a.text}</div>
            <div className={styles.activityMeta}>
              {a.actor} · <time dateTime={a.created_at} title={new Date(a.created_at).toLocaleString("fr-FR")}>{relativeTime(a.created_at)}</time>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** Mirrors the loaded page's shape (header / KPI strip / two-column grid /
 * activity card) so the layout doesn't jump once data arrives — no spinner,
 * no blank frame. */
function DashboardSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Skeleton width={150} height={22} />
          <div className={styles.skeletonGap}>
            <Skeleton width={210} height={13} />
          </div>
        </div>
      </div>

      <div className={styles.kpiStrip}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${styles.neutralCard} ${styles.kpiSkeleton}`}>
            <Skeleton width={28} height={28} radius="var(--radius-sm)" />
            <div className={styles.kpiSkeletonBody}>
              <Skeleton width={36} height={20} />
              <div className={styles.skeletonGapSm}>
                <Skeleton width="70%" height={11} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        <div className={styles.neutralCard}>
          <Skeleton width={80} height={14} />
          <div className={styles.skeletonGap}>
            <Skeleton width="100%" height={34} />
          </div>
        </div>
        <div className={styles.neutralCard}>
          <Skeleton width={80} height={14} />
          <div className={styles.skeletonGap}>
            <Skeleton width="100%" height={8} radius="var(--radius-pill)" />
          </div>
        </div>
      </div>

      <div className={styles.neutralCard}>
        <Skeleton width={110} height={14} />
        <div className={styles.skeletonGap}>
          <Skeleton width="100%" height={36} />
        </div>
      </div>
    </div>
  );
}
