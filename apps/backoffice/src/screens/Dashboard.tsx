import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Icon, Skeleton } from "@toboggo/design-system";
import {
  listParks,
  listReports,
  listReviews,
  listActivity,
  listPendingMedia,
  listMaintenance,
  listPendingParkEditsForOrg,
  listParkEdits,
  type Maintenance,
} from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";
import { activityIcon } from "../lib/activityCategory";
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
  loading: boolean;
  error: boolean;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, communeId } = useOrgScope();

  const parksQ = useQuery({ queryKey: ["dash-parks", communeId], queryFn: () => listParks({ communeId }) });
  const reportsQ = useQuery({ queryKey: ["dash-reports", communeId], queryFn: () => listReports({ communeId }) });
  const reviewsQ = useQuery({ queryKey: ["dash-reviews", communeId], queryFn: () => listReviews({ communeId }) });
  const activityQ = useQuery({ queryKey: ["dash-activity", communeId, isAdmin], queryFn: () => listActivity(isAdmin ? null : communeId!) });
  const pendingMediaQ = useQuery({
    queryKey: ["dash-pending-media", communeId],
    queryFn: () => listPendingMedia({ communeId }),
  });
  // Collectivité only: no cross-organisation "entretien" screen exists yet
  // for the admin context (hors scope de ce lot).
  const maintenanceQ = useQuery({
    queryKey: ["dash-maintenance", communeId],
    queryFn: () => listMaintenance(communeId!),
    enabled: !isAdmin && !!communeId,
  });
  // Admin voit la file cross-organisation : `park_edits_read` (RLS, migration
  // 0018) autorise `is_toboggo_staff` à tout lire, donc `listParkEdits`
  // (sans filtre org) est déjà correctement scopé côté serveur. Une
  // collectivité continue de voir uniquement ses propres parcs via
  // `listPendingParkEditsForOrg` (résolution par `organization_parks`, Lot 1).
  const pendingEditsQ = useQuery({
    queryKey: ["dash-pending-edits", communeId, isAdmin],
    queryFn: () => (isAdmin ? listParkEdits({ status: ["pending"] }) : listPendingParkEditsForOrg(communeId!)),
    enabled: isAdmin || !!communeId,
  });

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

  // "À traiter" ne doit jamais retomber sur un faux "rien à faire" pendant
  // que ses compteurs sont encore à 0 faute de données chargées — la liste
  // des sources qui le nourrissent pilote son propre loading/error, distinct
  // du reste de la page.
  const toTreatSources = isAdmin ? [parksQ, reportsQ, pendingEditsQ] : [reportsQ, pendingMediaQ, pendingEditsQ, maintenanceQ];
  const toTreatLoading = toTreatSources.some((q) => q.isLoading);
  const toTreatError = toTreatSources.some((q) => q.isError);
  function retryToTreat() {
    toTreatSources.forEach((q) => void q.refetch());
  }

  const actionItems: ActionItem[] = (
    isAdmin
      ? [
          { key: "parks", label: "Parcs en attente de validation", count: pending, onClick: () => navigate("/parks?status=pending") },
          { key: "reports", label: "Signalements ouverts", count: openReports, onClick: () => navigate("/reports") },
          // File de validation park_edits : DB + API prêtes, écran de revue
          // pas encore construit (prochain lot) — le volume est montré
          // honnêtement, sans faire semblant qu'il y a déjà quelque chose à
          // ouvrir.
          { key: "edits", label: "Infos à vérifier", count: pendingEdits.length, hint: "Écran dédié à venir" },
        ]
      : [
          { key: "reports", label: "Signalements ouverts", count: openReports, onClick: () => navigate("/reports") },
          { key: "media", label: "Photos en attente", count: pendingMedia.length, onClick: () => navigate("/photos") },
          { key: "edits", label: "Infos à vérifier", count: pendingEdits.length, hint: "Écran dédié à venir" },
          { key: "maintenance", label: "Entretien à venir", count: upcomingMaintenance, onClick: () => navigate("/maintenance") },
        ]
  ).filter((item) => item.count > 0);

  const stats: StatItem[] = isAdmin
    ? [
        {
          key: "active",
          value: published,
          label: "Parcs actifs",
          onClick: () => navigate("/parks?status=published"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "pending",
          value: pending,
          label: "Parcs en attente",
          onClick: () => navigate("/parks?status=pending"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "reports",
          value: openReports,
          label: "Signalements ouverts",
          onClick: () => navigate("/reports"),
          loading: reportsQ.isLoading,
          error: reportsQ.isError,
        },
        {
          key: "reviews",
          value: reviews.length,
          label: "Avis publiés",
          onClick: () => navigate("/reviews"),
          loading: reviewsQ.isLoading,
          error: reviewsQ.isError,
        },
        {
          key: "media",
          value: pendingMedia.length,
          label: "Photos en attente",
          onClick: () => navigate("/photos"),
          loading: pendingMediaQ.isLoading,
          error: pendingMediaQ.isError,
        },
      ]
    : [
        {
          key: "published",
          value: published,
          label: "Publiés",
          onClick: () => navigate("/parks?status=published"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "pending",
          value: pending,
          label: "En attente",
          onClick: () => navigate("/parks?status=pending"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "blocked",
          value: blocked,
          label: "Bloqués",
          onClick: () => navigate("/parks?status=blocked"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "total",
          value: parks.length,
          label: "Total",
          onClick: () => navigate("/parks?status=all"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
      ];

  return (
    <div>
      <PageHeader title="Tableau de bord" />

      <div className={styles.stack}>
        <Card flat>
          <h2 className={styles.sectionTitle}>À traiter</h2>
          {toTreatError ? (
            <ErrorInline onRetry={retryToTreat} />
          ) : toTreatLoading ? (
            <SkeletonActionRows count={2} />
          ) : actionItems.length === 0 ? (
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
                {stat.error ? (
                  <span className={styles.statError} title="Indisponible">
                    —
                  </span>
                ) : stat.loading ? (
                  <Skeleton width={32} height={20} />
                ) : (
                  <span className={styles.statValue}>{stat.value}</span>
                )}
                <span className={styles.statLabel}>{stat.label}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card flat>
          <h2 className={styles.sectionTitle}>Activité récente</h2>
          {activityQ.isError ? (
            <ErrorInline onRetry={() => void activityQ.refetch()} />
          ) : activityQ.isLoading ? (
            <SkeletonActivityRows count={4} />
          ) : (
            <ActivityList activity={activity} />
          )}
          {!isAdmin && !reviewsQ.isLoading && !reviewsQ.isError && lowReviews > 0 && (
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
      {activity.slice(0, 8).map((a) => {
        const icon = activityIcon(a.text);
        return (
          <div key={a.id} className={styles.activityRow}>
            {icon ? (
              <span className={styles.activityIconWrap}>
                <Icon name={icon} size={13} />
              </span>
            ) : (
              <span className={styles.activityDot} />
            )}
            <div>
              <div className={styles.activityText}>{a.text}</div>
              <div className={styles.activityMeta}>
                {a.actor} · {new Date(a.created_at).toLocaleString("fr-FR")}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function SkeletonActionRows({ count }: { count: number }) {
  return (
    <div className={styles.actionList}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.actionRow} style={{ cursor: "default" }}>
          <Skeleton width={`${50 + (i % 2) * 15}%`} height={12} />
          <Skeleton width={22} height={18} />
        </div>
      ))}
    </div>
  );
}

function SkeletonActivityRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.activityRow}>
          <span className={styles.activityDot} style={{ opacity: 0.4 }} />
          <div style={{ flex: 1 }}>
            <Skeleton width={`${55 + (i % 3) * 12}%`} height={13} />
            <div style={{ marginTop: 4 }}>
              <Skeleton width="35%" height={10} />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function ErrorInline({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.errorInline}>
      <span>Impossible de charger ces données.</span>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  );
}
