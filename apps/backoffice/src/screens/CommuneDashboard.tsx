import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon, ShimmerSkeleton as Skeleton, StatCard, type IconName } from "@toboggo/design-system";
import {
  listParks,
  listReports,
  listReviews,
  listActivity,
  listPendingMedia,
  listMaintenance,
  listPendingParkEditsForOrg,
  type Maintenance,
  type Park,
} from "@toboggo/shared";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { ReportsInsightPanel } from "./dashboard/ReportsInsightPanel";
import { MiniParkMap } from "./dashboard/MiniParkMap";
import { RecentReportsPanel } from "./dashboard/RecentReportsPanel";
import { PendingEditsPanel } from "./dashboard/PendingEditsPanel";
import { UpcomingMaintenancePanel } from "./dashboard/UpcomingMaintenancePanel";
import { RecentReviewsPanel } from "./dashboard/RecentReviewsPanel";
import { relativeTime } from "../lib/relativeTime";
import { CountBadge, panelStyles } from "../components/Panel";
import styles from "./CommuneDashboard.module.css";

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
  tone?: "neutral" | "warning" | "primary" | "accent";
  onClick?: () => void;
  /** Real derived figure only (e.g. an average rating) — omitted when there
   * is nothing real to show (COLL-02C §2). */
  secondary?: string;
}

export default function CommuneDashboard() {
  const navigate = useNavigate();
  const { communeId } = useOrgScope();
  const { userName } = useOrgSession();

  const parksQ = useQuery({ queryKey: ["dash-parks", communeId], queryFn: () => listParks({ communeId }) });
  const reportsQ = useQuery({ queryKey: ["dash-reports", communeId], queryFn: () => listReports({ communeId }) });
  const reviewsQ = useQuery({ queryKey: ["dash-reviews", communeId], queryFn: () => listReviews({ communeId }) });
  const activityQ = useQuery({ queryKey: ["dash-activity", communeId, false], queryFn: () => listActivity(communeId!), enabled: !!communeId });
  const pendingMediaQ = useQuery({ queryKey: ["dash-pending-media", communeId], queryFn: () => listPendingMedia({ communeId }) });
  const maintenanceQ = useQuery({
    queryKey: ["dash-maintenance", communeId],
    queryFn: () => listMaintenance(communeId!),
    enabled: !!communeId,
  });
  const pendingEditsQ = useQuery({
    queryKey: ["dash-pending-edits", communeId],
    queryFn: () => listPendingParkEditsForOrg(communeId!),
    enabled: !!communeId,
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
  const upcomingMaintenanceItems = maintenance.filter(isUpcoming);
  const upcomingMaintenance = upcomingMaintenanceItems.length;

  // "Actifs" (KPI headline) ≠ "ouverts" (À traiter, above) on purpose: the
  // KPI counts everything not yet closed (open + in_progress) as the
  // complement of "résolus", while "À traiter" only surfaces reports nobody
  // has picked up yet (COLL-02C §2).
  const activeReports = reports.filter((r) => r.status === "open" || r.status === "in_progress").length;
  const resolvedReports = reports.filter((r) => r.status === "resolved").length;
  const avgReviewRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  const parkById = new Map<string, Park>(parks.map((p) => [p.id, p]));

  const firstName = firstNameOrNull(userName);

  const kpis: KpiItem[] = [
    // Static category tints (COLL-02D §1): "gérés"/"résolus" read as
    // healthy baseline metrics (brand green); "actifs" stays a real
    // alert (amber) only once it's > 0; "reçus" gets a quiet amber
    // nod to the star rating it summarises.
    { key: "parks", value: parks.length, label: "Parcs gérés", icon: "ic-list", tone: "primary", onClick: () => navigate("/parks") },
    {
      key: "reportsActive",
      value: activeReports,
      label: "Signalements actifs",
      icon: "ic-flag",
      tone: activeReports > 0 ? "warning" : "neutral",
      onClick: () => navigate("/reports"),
    },
    {
      key: "reportsResolved",
      value: resolvedReports,
      label: "Signalements résolus",
      icon: "ic-check",
      tone: "primary",
      onClick: () => navigate("/reports"),
    },
    {
      key: "reviews",
      value: reviews.length,
      label: "Avis reçus",
      icon: "ic-review",
      tone: "accent",
      secondary: avgReviewRating != null ? `★ ${avgReviewRating.toFixed(1)} moyenne` : undefined,
      onClick: () => navigate("/reviews"),
    },
  ];

  const patrimonyTotal = parks.length || 1;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{firstName ? `Bonjour ${firstName}` : "Tableau de bord"}</h1>
          <p className={styles.subtitle}>Vue d'ensemble de votre collectivité</p>
        </div>
      </div>

      <div className={styles.kpiStrip}>
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.key}
            value={kpi.value}
            label={kpi.label}
            icon={kpi.icon}
            tone={kpi.tone}
            layout="inline"
            emphasized
            onClick={kpi.onClick}
            secondary={kpi.secondary}
          />
        ))}
      </div>

      <>
      <PatrimonyCard
        compact
        parks={parks}
        published={published}
        pending={pending}
        blocked={blocked}
        total={patrimonyTotal}
        navigate={navigate}
      />

      <div className={styles.rowTwo}>
        <ReportsInsightPanel reports={reports} />
        <MiniParkMap parks={parks} />
      </div>

      <div className={styles.rowThree}>
        <RecentReportsPanel reports={reports} />
        <PendingEditsPanel edits={pendingEdits} parkById={parkById} />
        <UpcomingMaintenancePanel items={upcomingMaintenanceItems} parkById={parkById} />
      </div>

      <div className={styles.rowTwo}>
        <RecentReviewsPanel reviews={reviews} lowCount={lowReviews} />
        <div className={`${panelStyles.neutralCard} ${styles.secondaryCard}`}>
          <div className={panelStyles.panelHeader}>
            <div className={panelStyles.panelHeaderTitle}>
              <span className={panelStyles.panelIcon}>
                <Icon name="ic-list" size={14} />
              </span>
              <h2 className={styles.sectionTitleCompact}>Activité récente</h2>
            </div>
          </div>
          <ActivityList activity={activity} compact />
        </div>
      </div>
      </>
    </div>
  );
}

/** Patrimoine (COLL-02B, polished in COLL-02D §3) — a résumé, not a report:
 * total / publiés / attente / bloqués + the real distribution bar. `compact`
 * (collectivité) renders it full-width with a header icon+total, now that
 * it no longer shares a row with "À traiter" (removed — see §2). Admin keeps
 * the original half-width card next to "À traiter", untouched. */
function PatrimonyCard({
  compact,
  parks,
  published,
  pending,
  blocked,
  total,
  navigate,
}: {
  compact?: boolean;
  parks: Park[];
  published: number;
  pending: number;
  blocked: number;
  total: number;
  navigate: (to: string) => void;
}) {
  return (
    <div className={`${panelStyles.neutralCard} ${styles.patrimony} ${compact ? styles.patrimonyCompact : ""}`}>
      <div className={panelStyles.panelHeader}>
        <div className={panelStyles.panelHeaderTitle}>
          <span className={panelStyles.panelIcon}>
            <Icon name="ic-list" size={compact ? 15 : 14} />
          </span>
          <h2 className={panelStyles.sectionTitle}>Patrimoine</h2>
        </div>
        {compact && (
          <span className={styles.patrimonyTotal}>
            Total <strong>{parks.length}</strong>
          </span>
        )}
      </div>
      {parks.length === 0 ? (
        <p className={styles.activityEmpty}>Aucun parc enregistré pour le moment.</p>
      ) : (
        <>
          <div className={styles.patrimonyBar} role="img" aria-label={`${published} parcs publiés, ${pending} en attente, ${blocked} bloqués sur ${parks.length} au total`}>
            <span className={styles.barPublished} style={{ width: `${(published / total) * 100}%` }} />
            <span className={styles.barPending} style={{ width: `${(pending / total) * 100}%` }} />
            <span className={styles.barBlocked} style={{ width: `${(blocked / total) * 100}%` }} />
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
            {!compact && (
              <span className={styles.legendTotal}>
                Total <strong>{parks.length}</strong>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ActivityList({
  activity,
  compact,
}: {
  activity: { id: string; text: string; actor: string; created_at: string }[];
  compact?: boolean;
}) {
  if (activity.length === 0) {
    return (
      <div className={panelStyles.empty}>
        <span className={panelStyles.emptyIcon}>
          <Icon name="ic-list" size={18} />
        </span>
        Aucune activité récente à afficher.
      </div>
    );
  }
  return (
    <>
      {activity.slice(0, compact ? 5 : 8).map((a) => (
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

function SkeletonCard({ lines = 1 }: { lines?: number }) {
  return (
    <div className={panelStyles.neutralCard}>
      <Skeleton width={80} height={14} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={styles.skeletonGap}>
          <Skeleton width="100%" height={34} />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the loaded page's shape so the layout doesn't jump once data
 * arrives — no spinner, no blank frame. Collectivité gets the full shape
 * (KPI strip / Patrimoine résumé / pilotage+carte / 3 aperçus / avis+activité,
 * COLL-02D §2). */
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
          <div key={i} className={`${panelStyles.neutralCard} ${styles.kpiSkeleton}`}>
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

      <>
      <div className={`${panelStyles.neutralCard} ${styles.patrimonyCompact}`}>
        <Skeleton width={90} height={14} />
        <div className={styles.skeletonGap}>
          <Skeleton width="100%" height={8} radius="var(--radius-pill)" />
        </div>
      </div>
      <div className={styles.rowTwo}>
        <SkeletonCard lines={2} />
        <SkeletonCard />
      </div>
      <div className={styles.rowThree}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className={styles.rowTwo}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
      </>
    </div>
  );
}
