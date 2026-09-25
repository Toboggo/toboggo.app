import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button, Card, Icon, Segmented, Skeleton, StatCard, type IconName } from "@toboggo/design-system";
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
  getParkStatusCounts,
  getParkCountryDistribution,
  listCommunes,
  listAllUsers,
  listOrganizationsWithCounts,
  toCsv,
  downloadCsv,
  mapStyleUrl,
  type Maintenance,
  type ParkCountryCount,
  type ParkSourceCount,
  type SourceType,
} from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";
import { activityIcon } from "../lib/activityCategory";
import styles from "./Dashboard.module.css";

// Fond de carte MapLibre pour « Couverture géographique » (Admin-UI-7D-D §1) —
// même variable/convention que MapScreen.tsx (VITE_MAP_STYLE_URL). Absente
// ⇒ le bloc affiche le même message « Carte indisponible » que /map, jamais
// une carte factice dessinée à la main.
const STYLE_URL = mapStyleUrl();

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
  /** Real secondary context only (Admin-UI-7D §2) — never fabricated, always
   * derived from data already loaded for this exact stat. */
  hint?: string;
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
  { key: "photos", label: "Modérer les photos", icon: "ic-camera", to: "/photos" },
];

const TOP_ORGANIZATIONS_LIMIT = 5;

// Admin-UI-7D-B §3/§4 : "évolution de l'activité" — 3 séries réellement
// disponibles SANS requête supplémentaire (activity/reports/reviews sont déjà
// intégralement chargées par ce même écran pour d'autres besoins). Photos et
// modifications ont aussi un `created_at` réel mais nécessiteraient 1-2
// requêtes de plus (listProcessedMedia, listParkEdits sans filtre statut) —
// volontairement pas ajoutées ici pour ne pas alourdir cette itération ;
// extension triviale plus tard si besoin.
//
// Le sélecteur de période (7/30/90 j) ne fait AUCUNE requête réseau : il ne
// fait que rebucketer les tableaux déjà en mémoire — donc aucune donnée
// inventée, mais deux limites réelles à connaître : `listActivity` plafonne
// à 200 lignes (les fenêtres 30/90 j peuvent donc être tronquées si plus de
// 200 événements existent sur la période) et, plus largement, TOUTE requête
// Supabase non paginée de ce projet est plafonnée à 1000 lignes
// (`supabase/config.toml` → `max_rows = 1000`, PostgREST) — `reports`/
// `reviews` en sont aujourd'hui loin, donc sans impact réel pour ces 2
// séries, mais la limite existe et vaut d'être connue.
const EVOLUTION_PERIODS = [7, 30, 90] as const;
type EvolutionDays = (typeof EVOLUTION_PERIODS)[number];
const dayFullFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short" });
const dayShortFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

interface EvolutionBucket {
  date: Date;
  count: number;
}
interface EvolutionSeries {
  key: string;
  label: string;
  color: string;
  data: EvolutionBucket[];
}

function bucketByDay(items: { created_at: string }[], days: number): EvolutionBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: EvolutionBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d, count: 0 });
  }
  for (const item of items) {
    const d = new Date(item.created_at);
    d.setHours(0, 0, 0, 0);
    const bucket = buckets.find((b) => b.date.getTime() === d.getTime());
    if (bucket) bucket.count++;
  }
  return buckets;
}

const EVO_W = 560;
const EVO_H = 110;

function ActivityEvolutionChart({ series, days }: { series: EvolutionSeries[]; days: number }) {
  const max = Math.max(1, ...series.flatMap((s) => s.data.map((b) => b.count)));
  const first = series[0]?.data[0]?.date;
  const last = series[0]?.data[series[0].data.length - 1]?.date;
  const totals = series.map((s) => ({ label: s.label, total: s.data.reduce((sum, b) => sum + b.count, 0) }));
  const ariaLabel = `Évolution sur ${days} jours — ${totals.map((t) => `${t.label} : ${t.total}`).join(", ")}`;

  function xAt(i: number, len: number) {
    return len > 1 ? (i / (len - 1)) * EVO_W : EVO_W / 2;
  }
  function yAt(count: number) {
    return EVO_H - (count / max) * EVO_H;
  }

  return (
    <div className={styles.evo}>
      <svg viewBox={`0 0 ${EVO_W} ${EVO_H}`} className={styles.evoSvg} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={0} x2={EVO_W} y1={EVO_H - f * EVO_H} y2={EVO_H - f * EVO_H} className={styles.evoGrid} />
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              points={s.data.map((b, i) => `${xAt(i, s.data.length)},${yAt(b.count)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.data.map((b, i) => (
              <circle key={i} cx={xAt(i, s.data.length)} cy={yAt(b.count)} r={days > 30 ? 1.5 : 2.5} fill={s.color}>
                <title>
                  {dayFullFmt.format(b.date)} · {s.label} : {b.count}
                </title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className={styles.evoAxis} aria-hidden="true">
        <span>{first && dayShortFmt.format(first)}</span>
        <span>{last && dayShortFmt.format(last)}</span>
      </div>
      <ul className={styles.evoLegend}>
        {totals.map((t, i) => (
          <li key={t.label} className={styles.evoLegendItem}>
            <span className={styles.evoLegendDot} style={{ background: series[i].color }} aria-hidden="true" />
            {t.label} <strong>{t.total}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, communeId } = useOrgScope();
  // Admin-UI-7D-B §4 : ne rejoue aucune requête réseau — rebucketing client
  // des séries déjà chargées ci-dessous, scope Admin uniquement.
  const [evoDays, setEvoDays] = useState<EvolutionDays>(7);

  // Admin-UI-7D-C : `listParks()` n'a pas de pagination — au-delà de
  // `max_rows` (PostgREST, 1000 localement) elle est silencieusement tronquée
  // (confirmé : 2201 parcs réels localement, cette requête n'en renvoyait que
  // 1000). Une collectivité reste petite par construction (ses propres parcs
  // seulement, via `organization_parks`) et n'a donc jamais ce problème — le
  // tableau complet reste chargé et utilisé tel quel pour elle. L'Admin, qui
  // voit tout le catalogue, ne télécharge plus ce tableau du tout : ses
  // compteurs viennent de `parkCountsQ` (comptages exacts serveur) ci-dessous.
  const parksQ = useQuery({ queryKey: ["dash-parks", communeId], queryFn: () => listParks({ communeId }), enabled: !isAdmin });
  // Comptages exacts (`count: "exact", head: true` — aucune ligne transférée,
  // jamais tronqué par max_rows) pour les 2 seuls statuts dont l'Admin a
  // besoin ici (Parcs actifs / Parcs en attente — "bloqué" et "total" ne sont
  // affichés que côté Collectivité, où `parksQ` ci-dessus reste fiable).
  const parkCountsQ = useQuery({
    queryKey: ["dash-park-status-counts"],
    queryFn: () => getParkStatusCounts(["published", "pending"]),
    enabled: isAdmin,
  });
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
  // Couverture géographique (Admin-UI-7D-C §4) : même raisonnement que
  // `sourceQ` — admin uniquement, catalogue entier, fiable au-delà de
  // max_rows (voir `getParkCountryDistribution`).
  const countryQ = useQuery({
    queryKey: ["dash-park-countries"],
    queryFn: () => getParkCountryDistribution(),
    enabled: isAdmin,
  });
  // KPI Collectivités/Utilisateurs (Admin-UI-4 §1) : totaux réels, admin
  // uniquement — une collectivité ne gère ni les autres organisations ni
  // l'ensemble des utilisateurs de la plateforme.
  const communesQ = useQuery({ queryKey: ["dash-communes"], queryFn: () => listCommunes(), enabled: isAdmin });
  const usersQ = useQuery({ queryKey: ["dash-all-users"], queryFn: () => listAllUsers(), enabled: isAdmin });
  // "Top collectivités" (Admin-UI-7D §8) : `organizations`/`organization_parks`
  // sont en lecture publique (RLS `using (true)`, migration 0018) — sans
  // rapport avec la piste `activity_log` écartée en Admin-UI-4 (celle-ci était
  // réellement bloquée : `listActivity(null)` en admin ne renvoie que les
  // entrées `organization_id IS NULL`, jamais l'activité des collectivités).
  // `listOrganizationsWithCounts` (déjà utilisée par Organizations.tsx) donne
  // donc un vrai classement par nombre de parcs rattachés, admin uniquement.
  const orgsQ = useQuery({
    queryKey: ["dash-organizations-counts"],
    queryFn: () => listOrganizationsWithCounts(),
    enabled: isAdmin,
  });

  const parks = parksQ.data ?? [];
  const reports = reportsQ.data ?? [];
  const reviews = reviewsQ.data ?? [];
  const activity = activityQ.data ?? [];
  const pendingMedia = pendingMediaQ.data ?? [];
  const maintenance = maintenanceQ.data ?? [];
  const pendingEdits = pendingEditsQ.data ?? [];
  const topOrganizations = [...(orgsQ.data ?? [])].sort((a, b) => b.parkCount - a.parkCount).slice(0, TOP_ORGANIZATIONS_LIMIT);
  const evolutionSeries: EvolutionSeries[] = [
    { key: "activity", label: "Activité", color: "var(--color-primary)", data: bucketByDay(activity, evoDays) },
    { key: "reports", label: "Signalements", color: "var(--color-error)", data: bucketByDay(reports, evoDays) },
    { key: "reviews", label: "Avis", color: "var(--color-info)", data: bucketByDay(reviews, evoDays) },
  ];
  const evolutionLoading = activityQ.isLoading || reportsQ.isLoading || reviewsQ.isLoading;
  const evolutionError = activityQ.isError || reportsQ.isError || reviewsQ.isError;

  // Admin-UI-7D-C : l'Admin utilise le comptage exact serveur (`parkCountsQ`),
  // jamais `parks.filter().length` (fiable seulement pour la Collectivité,
  // dont le tableau `parks` reste petit — voir le commentaire sur `parksQ`).
  // "blocked" reste dérivé de `parks` : uniquement affiché côté Collectivité.
  const published = isAdmin ? (parkCountsQ.data?.published ?? 0) : parks.filter((p) => p.status === "published").length;
  const pending = isAdmin ? (parkCountsQ.data?.pending ?? 0) : parks.filter((p) => p.status === "pending").length;
  const blocked = parks.filter((p) => p.status === "blocked").length;
  const openReports = reports.filter((r) => r.status === "open").length;
  // Admin-UI-4 §3 : plutôt qu'un 2e bloc "Alertes opérationnelles" dupliquant
  // les mêmes 4 catégories que « À traiter », le signal de sévérité (seule
  // information réellement nouvelle demandée) est fusionné dans sa ligne
  // "Signalements ouverts" — même compteur, juste plus précis.
  const criticalOpenReports = reports.filter((r) => r.status === "open" && (r.severity === "critical" || r.severity === "high")).length;
  const lowReviews = reviews.filter((r) => r.stars <= 2).length;
  const upcomingMaintenance = maintenance.filter(isUpcoming).length;
  const criticalHint =
    criticalOpenReports > 0
      ? `dont ${criticalOpenReports} critique${criticalOpenReports > 1 ? "s" : ""}/haute${criticalOpenReports > 1 ? "s" : ""} sévérité`
      : undefined;

  // "À traiter" ne doit jamais retomber sur un faux "rien à faire" pendant
  // que ses compteurs sont encore à 0 faute de données chargées — la liste
  // des sources qui le nourrissent pilote son propre loading/error, distinct
  // du reste de la page.
  const toTreatSources = isAdmin
    ? [parkCountsQ, reportsQ, pendingEditsQ, pendingMediaQ]
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
      hint: criticalHint,
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
          loading: parkCountsQ.isLoading,
          error: parkCountsQ.isError,
        },
        {
          key: "pending",
          value: pending,
          label: "Parcs en attente",
          icon: "ic-list",
          tint: "warning",
          onClick: () => navigate("/parks?status=pending"),
          loading: parkCountsQ.isLoading,
          error: parkCountsQ.isError,
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
          hint: criticalHint,
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
          icon: "ic-camera",
          tint: "warning",
          onClick: () => navigate("/photos"),
          loading: pendingMediaQ.isLoading,
          error: pendingMediaQ.isError,
        },
        {
          key: "organizations",
          value: communesQ.data?.length ?? 0,
          label: "Collectivités",
          icon: "ic-building",
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

  // Contenu (sans le `Card` englobant) partagé entre les deux rôles — seul le
  // wrapper diffère (variant="admin" pour l'Admin, `flat` inchangé pour la
  // Collectivité, cf. Admin-UI-7C : ne jamais toucher le rendu Collectivité).
  const toTreatBody = toTreatError ? (
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
  );

  const activityListBody = activityQ.isError ? (
    <ErrorInline onRetry={() => void activityQ.refetch()} />
  ) : activityQ.isLoading ? (
    <SkeletonActivityRows count={4} />
  ) : (
    <ActivityList activity={activity} />
  );

  const lowReviewsRow = !isAdmin && !reviewsQ.isLoading && !reviewsQ.isError && lowReviews > 0 && (
    <button type="button" className={styles.actionRow} onClick={() => navigate("/reviews")} style={{ marginTop: 8 }}>
      <span className={styles.actionLabel}>Avis ≤2★ à examiner</span>
      <span className={styles.countBadge}>{lowReviews}</span>
    </button>
  );

  if (!isAdmin) {
    // Vue Collectivité — strictement inchangée depuis Admin-UI-4 (Admin-UI-7D
    // ne concerne que le Dashboard Admin, cf. consigne).
    return (
      <div>
        <PageHeader
          title="Tableau de bord"
          actions={
            <Button size="sm" variant="secondary" disabled={!canExport} onClick={exportDashboard}>
              <Icon name="ic-download" size={14} />
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

        <div className={styles.stack}>
          <Card flat padding="sm" className={styles.card}>
            <h2 className={styles.sectionTitle}>À traiter</h2>
            {toTreatBody}
          </Card>
          <Card flat padding="sm" className={styles.card}>
            <h2 className={styles.sectionTitle}>Activité récente</h2>
            {activityListBody}
            {lowReviewsRow}
          </Card>
        </div>
      </div>
    );
  }

  // Vue Admin (Admin-UI-7D) — grille dense : KPI en haut, zone principale
  // (activité + répartition + top collectivités) plus large que le rail
  // droit (à traiter + actions rapides), cf. maquette cible.
  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de l'activité Toboggo."
        actions={
          <Button size="sm" variant="secondary" disabled={!canExport} onClick={exportDashboard}>
            <Icon name="ic-download" size={14} />
            Exporter
          </Button>
        }
      />

      <div className={styles.kpiGridAdmin}>
        {stats.map((stat) => (
          <StatCard
            key={stat.key}
            icon={stat.icon}
            label={stat.label}
            tone={stat.tint}
            onClick={stat.onClick}
            hint={stat.hint}
            value={
              stat.error ? (
                <span title="Indisponible">—</span>
              ) : stat.loading ? (
                <Skeleton width={28} height={18} />
              ) : (
                stat.value
              )
            }
          />
        ))}
      </div>

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <Card variant="admin" padding="sm" className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Évolution de l'activité</h2>
              <Segmented
                options={EVOLUTION_PERIODS.map((d) => ({ value: String(d), label: `${d} j` }))}
                value={String(evoDays)}
                onChange={(v) => setEvoDays(Number(v) as EvolutionDays)}
              />
            </div>
            {!evolutionLoading && !evolutionError && <ActivityEvolutionChart series={evolutionSeries} days={evoDays} />}
            {activityListBody}
          </Card>

          <Card variant="admin" padding="sm" className={styles.card}>
            <h2 className={styles.sectionTitle}>Répartition des parcs par source</h2>
            <SourceBreakdown
              data={sourceQ.data}
              isLoading={sourceQ.isLoading}
              isError={sourceQ.isError}
              onRetry={() => void sourceQ.refetch()}
              onSelectSource={(source) => navigate(`/parks?source=${source}&status=all`)}
              onViewAll={() => navigate("/parks?status=all")}
            />
          </Card>

          <Card variant="admin" padding="sm" className={styles.card}>
            <h2 className={styles.sectionTitle}>Couverture géographique</h2>
            {!countryQ.isLoading && !countryQ.isError && (
              <GeoCoverageMap rows={countryQ.data ?? []} onSelectCountry={(code) => navigate(`/parks?country=${code}&status=all`)} />
            )}
            <CountryBreakdown
              data={countryQ.data}
              isLoading={countryQ.isLoading}
              isError={countryQ.isError}
              onRetry={() => void countryQ.refetch()}
              onSelectCountry={(code) => navigate(`/parks?country=${code}&status=all`)}
            />
          </Card>

          <Card variant="admin" padding="sm" className={styles.card}>
            <h2 className={styles.sectionTitle}>Top collectivités</h2>
            <TopOrganizations
              data={orgsQ.data}
              top={topOrganizations}
              isLoading={orgsQ.isLoading}
              isError={orgsQ.isError}
              onRetry={() => void orgsQ.refetch()}
              onOpen={(id) => navigate(`/organizations/${id}`)}
            />
          </Card>
        </div>

        <div className={styles.sideCol}>
          <Card variant="admin" padding="sm" className={styles.card}>
            <h2 className={styles.sectionTitle}>À traiter</h2>
            {toTreatBody}
          </Card>

          <Card variant="admin" padding="sm" className={styles.card}>
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
    </div>
  );
}

function SourceBreakdown({
  data,
  isLoading,
  isError,
  onRetry,
  onSelectSource,
  onViewAll,
}: {
  data: ParkSourceCount[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Admin-UI-7D-B §2 : `/parks` sait déjà lire `?source=` côté client
   * (Parks.tsx, Admin-UI-5B) — synthèse → détail réutilise ce filtre réel
   * tel quel, sans y toucher. `status=all` est explicite : l'admin par
   * défaut de `/parks` est `status=pending`, ce qui masquerait la plupart
   * des parcs d'une source alors que ce donut porte sur le catalogue entier. */
  onSelectSource: (source: SourceType) => void;
  onViewAll: () => void;
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
    return (
      <>
        <p className={styles.activityEmpty}>Aucune source enregistrée pour le moment.</p>
        <button type="button" className={styles.viewAllLink} onClick={onViewAll}>
          Voir tous les parcs ›
        </button>
      </>
    );
  }

  const R = 45;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <>
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
          <li key={row.source_type}>
            <button
              type="button"
              className={styles.donutLegendRow}
              onClick={() => onSelectSource(row.source_type)}
              aria-label={`Voir les parcs source ${SOURCE_TYPE_LABEL[row.source_type] ?? row.source_type} (${row.count})`}
            >
              <span className={styles.donutSwatch} style={{ background: SOURCE_TYPE_COLOR[row.source_type] }} aria-hidden="true" />
              <span className={styles.donutLegendText}>
                <span className={styles.donutLegendLabel}>{SOURCE_TYPE_LABEL[row.source_type] ?? row.source_type}</span>
                <span className={styles.donutLegendCount}>
                  {row.count} · {Math.round((row.count / total) * 100)}%
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
    <button type="button" className={styles.viewAllLink} onClick={onViewAll}>
      Voir tous les parcs ›
    </button>
    </>
  );
}

// Libellés lisibles pour les codes ISO les plus probables du catalogue —
// purement cosmétique : un pays absent de ce dictionnaire s'affiche quand
// même, avec son code brut comme libellé (jamais masqué, jamais bloquant —
// voir "prévoir l'architecture pour que de futurs pays apparaissent
// automatiquement", Admin-UI-7D-C §4).
const COUNTRY_LABEL: Record<string, string> = {
  FR: "France",
  ES: "Espagne",
  BE: "Belgique",
  CH: "Suisse",
  DE: "Allemagne",
  IT: "Italie",
  PT: "Portugal",
  LU: "Luxembourg",
};

/**
 * Admin-UI-7D-D §1 — centroïdes géographiques approximatifs (repères publics
 * connus, PAS des frontières : un seul point par pays, jamais un tracé de
 * côte/frontière fabriqué) utilisés uniquement pour positionner un marker
 * AGRÉGÉ par pays sur la mini-carte ci-dessous. Un pays présent dans
 * `getParkCountryDistribution()` mais absent d'ici reste malgré tout visible
 * dans la liste de barres en dessous (jamais masqué) — juste sans point sur
 * la carte tant que son centroïde n'a pas été ajouté ici.
 */
const COUNTRY_CENTROID: Record<string, [number, number]> = {
  FR: [2.2137, 46.2276],
  ES: [-3.7492, 40.4637],
  BE: [4.4699, 50.5039],
  CH: [8.2275, 46.8182],
  DE: [10.4515, 51.1657],
  IT: [12.5674, 41.8719],
  PT: [-8.2245, 39.3999],
  LU: [6.1296, 49.8153],
};
// Cadrage fixe et volontairement générique ("Europe cadrée proprement",
// Admin-UI-7D-D §1) plutôt qu'un fitBounds recalculé à chaque changement de
// données : la carte ne saute pas de zoom quand un pays s'ajoute/disparaît,
// et un futur pays européen dont le centroïde est ajouté ci-dessus apparaît
// sans autre changement.
const GEO_MAP_CENTER: [number, number] = [8, 47.5];
const GEO_MAP_ZOOM = 3.4;

/**
 * Admin-UI-7D-D §1 — vraie carte MapLibre (même moteur/convention que
 * MapScreen.tsx, aucune nouvelle librairie), mais avec un marker AGRÉGÉ par
 * pays (taille proportionnelle au nombre de parcs) plutôt qu'un marker par
 * parc — jamais des milliers de points individuels. Repose uniquement sur
 * `COUNTRY_CENTROID` (repères, pas des frontières) : aucun fond
 * géographique (GeoJSON de frontières) n'existe dans le repo et aucun n'est
 * fabriqué ici. `STYLE_URL` absent ⇒ même message qu'/map, jamais une carte
 * dessinée à la main.
 */
function GeoCoverageMap({ rows, onSelectCountry }: { rows: ParkCountryCount[]; onSelectCountry: (code: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const plottable = rows.filter((r) => COUNTRY_CENTROID[r.country_code]);
  const maxCount = Math.max(1, ...plottable.map((r) => r.count));

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !STYLE_URL || plottable.length === 0) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: GEO_MAP_CENTER,
      zoom: GEO_MAP_ZOOM,
      interactive: false,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plottable.length > 0]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = plottable.map((row) => {
      const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
      const size = 14 + Math.round((row.count / maxCount) * 22);
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Voir les parcs de ${COUNTRY_LABEL[row.country_code] ?? row.country_code} (${row.count})`);
      el.title = `${COUNTRY_LABEL[row.country_code] ?? row.country_code} — ${row.count} parcs (${pct}%)`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderRadius = "50%";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
      el.style.background = "var(--color-primary)";
      el.style.cursor = "pointer";
      el.onclick = () => onSelectCountry(row.country_code);
      return new maplibregl.Marker({ element: el }).setLngLat(COUNTRY_CENTROID[row.country_code]).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [plottable, total, maxCount, onSelectCountry]);

  if (!STYLE_URL) {
    return <div className={styles.geoMapUnavailable}>Carte indisponible : renseignez VITE_MAP_STYLE_URL dans .env.</div>;
  }
  if (plottable.length === 0) return null;
  return <div ref={containerRef} className={styles.geoMap} />;
}

/**
 * Admin-UI-7D-C §4 / 7D-D §1 — répartition réelle du catalogue par
 * `country_code` (`getParkCountryDistribution`, fiable au-delà de
 * `max_rows` — voir le commentaire sur `countryQ`). Liste conservée sous la
 * carte (Admin-UI-7D-D §1 : "conserver éventuellement la liste ... si cela
 * améliore la lisibilité") : chiffres exacts, accessible clavier/lecteur
 * d'écran, et seul affichage restant pour un pays sans centroïde connu.
 * Aucun marker individuel, jamais un pays codé en dur : ce composant ne fait
 * qu'afficher ce que `data` contient.
 */
function CountryBreakdown({
  data,
  isLoading,
  isError,
  onRetry,
  onSelectCountry,
}: {
  data: ParkCountryCount[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectCountry: (countryCode: string) => void;
}) {
  if (isError) return <ErrorInline onRetry={onRetry} />;
  if (isLoading) {
    return (
      <div className={styles.countryList}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={styles.countryRow}>
            <Skeleton width="40%" height={13} />
            <Skeleton width="100%" height={8} />
          </div>
        ))}
      </div>
    );
  }
  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) {
    return <p className={styles.activityEmpty}>Aucun pays enregistré pour le moment.</p>;
  }
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className={styles.countryList}>
      {rows.map((row) => {
        const pct = Math.round((row.count / total) * 100);
        return (
          <li key={row.country_code}>
            <button
              type="button"
              className={styles.countryRow}
              onClick={() => onSelectCountry(row.country_code)}
              aria-label={`Voir les parcs de ${COUNTRY_LABEL[row.country_code] ?? row.country_code} (${row.count})`}
            >
              <span className={styles.countryHead}>
                <span className={styles.countryName}>{COUNTRY_LABEL[row.country_code] ?? row.country_code}</span>
                <span className={styles.countryCount}>
                  {row.count} · {pct}%
                </span>
              </span>
              <span className={styles.countryBarTrack}>
                <span className={styles.countryBarFill} style={{ width: `${(row.count / max) * 100}%` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Admin-UI-7D §8 — classement réel par `parkCount` (`listOrganizationsWithCounts`,
 * `organizations`/`organization_parks` en lecture publique — voir le
 * commentaire sur `orgsQ`). Aucune sparkline, aucune tendance : uniquement le
 * total de parcs rattachés, explicitement nommé.
 */
function TopOrganizations({
  data,
  top,
  isLoading,
  isError,
  onRetry,
  onOpen,
}: {
  data: { id: string }[] | undefined;
  top: { id: string; name: string; parkCount: number }[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
}) {
  if (isError) return <ErrorInline onRetry={onRetry} />;
  if (isLoading) {
    return (
      <div className={styles.orgList}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={styles.orgRow}>
            <Skeleton width="60%" height={13} />
            <Skeleton width={28} height={13} />
          </div>
        ))}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <p className={styles.activityEmpty}>Aucune collectivité enregistrée pour le moment.</p>;
  }
  return (
    <ul className={styles.orgList}>
      {top.map((org, i) => (
        <li key={org.id}>
          <button type="button" className={styles.orgRow} onClick={() => onOpen(org.id)}>
            <span className={styles.orgRank}>{i + 1}</span>
            <span className={styles.orgName}>{org.name}</span>
            <span className={styles.orgCount}>
              {org.parkCount} parc{org.parkCount > 1 ? "s" : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
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
