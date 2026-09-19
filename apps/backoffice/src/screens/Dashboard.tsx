import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Button, Card, Icon, Skeleton, type IconName } from "@toboggo/design-system";
import {
  listParks,
  listReports,
  listReviews,
  listActivity,
  listPendingMedia,
  listMaintenance,
  listPendingParkEditsForOrg,
  listParkEdits,
  getParkSourceDistribution,
  listCommunes,
  listAllUsers,
  toCsv,
  downloadCsv,
  type Maintenance,
  type ParkSourceCount,
  type SourceType,
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

type Tint = "primary" | "warning" | "error" | "info";

interface ActionItem {
  key: string;
  label: string;
  count: number;
  tint: Tint;
  onClick?: () => void;
  hint?: string;
}

interface StatItem {
  key: string;
  value: number;
  label: string;
  icon?: IconName;
  tint: Tint;
  onClick: () => void;
  loading: boolean;
  error: boolean;
}

// Même libellés que Photos.tsx / PhotosPanel.tsx (pas de 2e formulation pour
// les mêmes 7 valeurs de `source_type`).
const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  user: "Contributeurs",
  municipality: "Collectivités",
  toboggo: "Toboggo",
  open_data: "Open data",
  partner: "Partenaires",
  osm: "OpenStreetMap",
  other: "Autre",
};
// Couleur fixée PAR TYPE (pas par rang) : la légende reste stable dans le
// temps même si la composition du catalogue change.
const SOURCE_TYPE_COLOR: Record<SourceType, string> = {
  osm: "var(--color-info)",
  municipality: "var(--color-primary)",
  user: "var(--color-accent)",
  toboggo: "var(--color-primary-pressed)",
  open_data: "var(--color-primary-hover)",
  partner: "var(--color-warning-text)",
  other: "var(--color-text-faint)",
};

const QUICK_ACTIONS: { key: string; label: string; icon?: IconName; to: string }[] = [
  { key: "parks", label: "Gérer les parcs", icon: "ic-list", to: "/parks" },
  { key: "reports", label: "Voir les signalements", icon: "ic-flag", to: "/reports" },
  { key: "validation", label: "Ouvrir la file de validation", icon: "ic-check", to: "/validation" },
  // "Photos" n'a pas de pictogramme sûr dans le sprite (même constat que la
  // nav — voir NAV_ICON_GAPS dans Shell.tsx) : pas d'icône inventée.
  { key: "photos", label: "Modérer les photos", to: "/photos" },
];

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
  // Répartition par source (Admin-UI-2 §3) : catalogue entier, admin
  // uniquement — peu de sens pour une collectivité qui ne voit que ses
  // propres parcs (quasi toujours une seule source).
  const sourceQ = useQuery({
    queryKey: ["dash-park-sources"],
    queryFn: () => getParkSourceDistribution(),
    enabled: isAdmin,
  });
  // KPI Collectivités/Utilisateurs (Admin-UI-4 §1) : totaux réels, admin
  // uniquement — une collectivité ne gère ni les autres organisations ni
  // l'ensemble des utilisateurs de la plateforme.
  const communesQ = useQuery({ queryKey: ["dash-communes"], queryFn: () => listCommunes(), enabled: isAdmin });
  const usersQ = useQuery({ queryKey: ["dash-all-users"], queryFn: () => listAllUsers(), enabled: isAdmin });

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
  // Admin-UI-4 §3 : plutôt qu'un 2e bloc "Alertes opérationnelles" dupliquant
  // les mêmes 4 catégories que « À traiter », le signal de sévérité (seule
  // information réellement nouvelle demandée) est fusionné dans sa ligne
  // "Signalements ouverts" — même compteur, juste plus précis.
  const criticalOpenReports = reports.filter((r) => r.status === "open" && (r.severity === "critical" || r.severity === "high")).length;
  const lowReviews = reviews.filter((r) => r.stars <= 2).length;
  const upcomingMaintenance = maintenance.filter(isUpcoming).length;

  // "À traiter" ne doit jamais retomber sur un faux "rien à faire" pendant
  // que ses compteurs sont encore à 0 faute de données chargées — la liste
  // des sources qui le nourrissent pilote son propre loading/error, distinct
  // du reste de la page.
  const toTreatSources = isAdmin
    ? [parksQ, reportsQ, pendingEditsQ, pendingMediaQ]
    : [reportsQ, pendingMediaQ, pendingEditsQ, maintenanceQ];
  const toTreatLoading = toTreatSources.some((q) => q.isLoading);
  const toTreatError = toTreatSources.some((q) => q.isError);
  function retryToTreat() {
    toTreatSources.forEach((q) => void q.refetch());
  }

  const adminActionItems: ActionItem[] = [
    {
      key: "reports",
      label: "Signalements ouverts",
      count: openReports,
      tint: criticalOpenReports > 0 ? "error" : "warning",
      onClick: () => navigate("/reports"),
      hint: criticalOpenReports > 0 ? `dont ${criticalOpenReports} critique${criticalOpenReports > 1 ? "s" : ""}/haute${criticalOpenReports > 1 ? "s" : ""} sévérité` : undefined,
    },
    { key: "parks", label: "Parcs en attente de validation", count: pending, tint: "warning", onClick: () => navigate("/parks?status=pending") },
    // La file de validation park_edits a désormais un vrai écran
    // (Admin-3B-1/3B-2, route /validation) — plus un "écran à venir".
    { key: "edits", label: "Modifications à valider", count: pendingEdits.length, tint: "warning", onClick: () => navigate("/validation") },
    { key: "media", label: "Photos en attente", count: pendingMedia.length, tint: "info", onClick: () => navigate("/photos") },
  ];
  const communeActionItems: ActionItem[] = [
    { key: "reports", label: "Signalements ouverts", count: openReports, tint: "error", onClick: () => navigate("/reports") },
    { key: "media", label: "Photos en attente", count: pendingMedia.length, tint: "info", onClick: () => navigate("/photos") },
    { key: "edits", label: "Infos à vérifier", count: pendingEdits.length, tint: "warning", hint: "Écran dédié à venir" },
    { key: "maintenance", label: "Entretien à venir", count: upcomingMaintenance, tint: "warning", onClick: () => navigate("/maintenance") },
  ];
  // Admin-UI-2B : les catégories utiles restent toujours visibles (liste
  // stable, scannable) — un compteur à 0 se lit en discret plutôt que de
  // disparaître derrière un grand état vide générique.
  const actionItems: ActionItem[] = isAdmin ? adminActionItems : communeActionItems;

  const stats: StatItem[] = isAdmin
    ? [
        {
          key: "active",
          value: published,
          label: "Parcs actifs",
          icon: "ic-list",
          tint: "primary",
          onClick: () => navigate("/parks?status=published"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "pending",
          value: pending,
          label: "Parcs en attente",
          icon: "ic-list",
          tint: "warning",
          onClick: () => navigate("/parks?status=pending"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "reports",
          value: openReports,
          label: "Signalements ouverts",
          icon: "ic-flag",
          tint: "error",
          onClick: () => navigate("/reports"),
          loading: reportsQ.isLoading,
          error: reportsQ.isError,
        },
        {
          key: "reviews",
          value: reviews.length,
          label: "Avis publiés",
          icon: "ic-review",
          tint: "info",
          onClick: () => navigate("/reviews"),
          loading: reviewsQ.isLoading,
          error: reviewsQ.isError,
        },
        {
          key: "media",
          value: pendingMedia.length,
          label: "Photos en attente",
          tint: "warning",
          onClick: () => navigate("/photos"),
          loading: pendingMediaQ.isLoading,
          error: pendingMediaQ.isError,
        },
        {
          key: "organizations",
          value: communesQ.data?.length ?? 0,
          label: "Collectivités",
          // Aucun pictogramme sûr dans le sprite pour « collectivité »
          // (bâtiment/mairie) — voir NAV_ICON_GAPS (Shell.tsx) : pas d'icône
          // inventée, listée en fin de rapport plutôt qu'un rond générique.
          tint: "primary",
          onClick: () => navigate("/organizations"),
          loading: communesQ.isLoading,
          error: communesQ.isError,
        },
        {
          key: "users",
          value: usersQ.data?.length ?? 0,
          label: "Utilisateurs",
          icon: "ic-users",
          tint: "info",
          onClick: () => navigate("/users"),
          loading: usersQ.isLoading,
          error: usersQ.isError,
        },
      ]
    : [
        {
          key: "published",
          value: published,
          label: "Publiés",
          icon: "ic-list",
          tint: "primary",
          onClick: () => navigate("/parks?status=published"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "pending",
          value: pending,
          label: "En attente",
          icon: "ic-list",
          tint: "warning",
          onClick: () => navigate("/parks?status=pending"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "blocked",
          value: blocked,
          label: "Bloqués",
          icon: "ic-list",
          tint: "error",
          onClick: () => navigate("/parks?status=blocked"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
        {
          key: "total",
          value: parks.length,
          label: "Total",
          icon: "ic-list",
          tint: "info",
          onClick: () => navigate("/parks?status=all"),
          loading: parksQ.isLoading,
          error: parksQ.isError,
        },
      ];

  // Admin-UI-4 §4 : export des KPI/compteurs réels affichés — mêmes
  // utilitaires que Users.tsx/Statistiques.tsx, aucune nouvelle dépendance.
  const canExport = stats.every((s) => !s.loading);
  function exportDashboard() {
    const rows = stats.map((s) => ({ Indicateur: s.label, Valeur: s.error ? "Indisponible" : s.value }));
    downloadCsv("toboggo-dashboard.csv", toCsv(rows, ["Indicateur", "Valeur"]));
  }

  const toTreatCard = (
    <Card flat padding="sm" className={styles.card}>
      <h2 className={styles.sectionTitle}>À traiter</h2>
      {toTreatError ? (
        <ErrorInline onRetry={retryToTreat} />
      ) : toTreatLoading ? (
        <SkeletonActionRows count={4} />
      ) : (
        <div className={styles.actionList}>
          {actionItems.map((item) => {
            const isZero = item.count === 0;
            const content = (
              <>
                <span className={styles.actionLabel}>
                  <span
                    className={clsx(styles.actionDot, isZero ? styles.actionDotZero : styles[`tint-${item.tint}`])}
                    aria-hidden="true"
                  />
                  <span className={isZero ? styles.actionLabelZero : undefined}>{item.label}</span>
                  {item.hint && <span className={styles.actionHint}>{item.hint}</span>}
                </span>
                <span className={clsx(styles.countBadge, isZero ? styles.countBadgeZero : styles[`tint-${item.tint}`])}>
                  {item.count}
                </span>
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
  );

  const activityCard = (
    <Card flat padding="sm" className={styles.card}>
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
  );

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle={isAdmin ? "Vue d'ensemble de l'activité Toboggo." : undefined}
        actions={
          <Button size="sm" variant="secondary" disabled={!canExport} onClick={exportDashboard}>
            Exporter
          </Button>
        }
      />

      <div className={styles.kpiGrid}>
        {stats.map((stat) => (
          <button key={stat.key} type="button" className={styles.kpiTile} onClick={stat.onClick}>
            <span className={clsx(styles.kpiIcon, styles[`tint-${stat.tint}`])}>{stat.icon && <Icon name={stat.icon} size={13} />}</span>
            {stat.error ? (
              <span className={styles.statError} title="Indisponible">
                —
              </span>
            ) : stat.loading ? (
              <Skeleton width={32} height={20} />
            ) : (
              <span className={styles.kpiValue}>{stat.value}</span>
            )}
            <span className={styles.kpiLabel}>{stat.label}</span>
          </button>
        ))}
      </div>

      {isAdmin ? (
        <div className={styles.grid}>
          <div className={styles.mainCol}>
            {toTreatCard}
            {activityCard}
          </div>
          <div className={styles.sideCol}>
            <Card flat padding="sm" className={styles.card}>
              <h2 className={styles.sectionTitle}>Répartition des parcs par source</h2>
              <SourceBreakdown
                data={sourceQ.data}
                isLoading={sourceQ.isLoading}
                isError={sourceQ.isError}
                onRetry={() => void sourceQ.refetch()}
              />
            </Card>
            <Card flat padding="sm" className={styles.card}>
              <h2 className={styles.sectionTitle}>Actions rapides</h2>
              <div className={styles.quickActions}>
                {QUICK_ACTIONS.map((a) => (
                  <button key={a.key} type="button" className={styles.quickAction} onClick={() => navigate(a.to)}>
                    <span className={styles.quickActionIcon}>{a.icon && <Icon name={a.icon} size={13} />}</span>
                    <span className={styles.quickActionLabel}>{a.label}</span>
                    <span className={styles.quickActionChevron} aria-hidden="true">
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className={styles.stack}>
          {toTreatCard}
          {activityCard}
        </div>
      )}
    </div>
  );
}

function SourceBreakdown({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: ParkSourceCount[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isError) return <ErrorInline onRetry={onRetry} />;
  if (isLoading) {
    return (
      <div className={styles.donutWrap}>
        <Skeleton width={120} height={120} />
      </div>
    );
  }
  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) {
    return <p className={styles.activityEmpty}>Aucune source enregistrée pour le moment.</p>;
  }

  const R = 45;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 120 120" className={styles.donutSvg} role="img" aria-label={`Répartition des ${total} parcs par source`}>
        <circle cx={60} cy={60} r={R} fill="none" stroke="var(--color-border)" strokeWidth={16} />
        {rows.map((row) => {
          const len = (row.count / total) * C;
          const el = (
            <circle
              key={row.source_type}
              cx={60}
              cy={60}
              r={R}
              fill="none"
              stroke={SOURCE_TYPE_COLOR[row.source_type]}
              strokeWidth={16}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += len;
          return el;
        })}
        <text x={60} y={56} textAnchor="middle" className={styles.donutTotalValue}>
          {total}
        </text>
        <text x={60} y={72} textAnchor="middle" className={styles.donutTotalLabel}>
          parcs
        </text>
      </svg>
      <ul className={styles.donutLegend}>
        {rows.map((row) => (
          <li key={row.source_type} className={styles.donutLegendRow}>
            <span className={styles.donutSwatch} style={{ background: SOURCE_TYPE_COLOR[row.source_type] }} aria-hidden="true" />
            <span className={styles.donutLegendText}>
              <span className={styles.donutLegendLabel}>{SOURCE_TYPE_LABEL[row.source_type] ?? row.source_type}</span>
              <span className={styles.donutLegendCount}>
                {row.count} · {Math.round((row.count / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
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
