import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Button, Menu, MenuItem, Tabs, TabPanel, useToast } from "@toboggo/design-system";
import {
  getPark,
  listParkEditsWithDetails,
  listReportsForPark,
  listReviewsForPark,
  listSources,
  logActivity,
  setParkStatus,
  type SourceType,
} from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkStatusTag, ParkVerificationTag } from "../components/StatusTag";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { usePermissions } from "../lib/permissions";
import { useAsyncAction } from "../lib/useAsyncAction";
import { useUnsavedChangesGuard } from "../lib/useUnsavedChangesGuard";
import { parkStatusTransitions } from "../lib/parkStatus";
import { queryClient } from "../lib/queryClient";
import { OverviewPanel } from "./parkDetail/OverviewPanel";
import { InfoPanel } from "./parkDetail/InfoPanel";
import { FeaturesPanel } from "./parkDetail/FeaturesPanel";
import { PhotosPanel } from "./parkDetail/PhotosPanel";
import { ReviewsPanel } from "./parkDetail/ReviewsPanel";
import { ReportsPanel } from "./parkDetail/ReportsPanel";
import { ParkEditsPanel } from "./parkDetail/ParkEditsPanel";
import { HistoryPanel } from "./parkDetail/HistoryPanel";
import styles from "./ParkDetail.module.css";

export type TabValue = "overview" | "info" | "features" | "photos" | "reviews" | "reports" | "edits" | "history";
const TAB_ORDER: { value: TabValue; label: string }[] = [
  { value: "overview", label: "Vue d'ensemble" },
  { value: "info", label: "Données / Informations" },
  { value: "features", label: "Équipements & services" },
  { value: "photos", label: "Photos" },
  { value: "reviews", label: "Avis" },
  { value: "reports", label: "Signalements" },
  { value: "edits", label: "Modifications proposées" },
  { value: "history", label: "Historique" },
];

function tabLabel(base: string, count: number, alert = false) {
  return (
    <>
      {base}
      {count > 0 && <span className={clsx(styles.tabCount, alert && styles.tabCountAlert)}>{count}</span>}
    </>
  );
}

// Même libellés que Parks.tsx (`SOURCE_LABEL`) / Photos.tsx / PhotosPanel.tsx —
// pas de 2e formulation pour les mêmes 7 valeurs de `source_type`.
const SOURCE_LABEL: Record<SourceType, string> = {
  user: "Contributeur",
  municipality: "Collectivité",
  toboggo: "Toboggo",
  open_data: "Open data",
  partner: "Partenaire",
  osm: "OpenStreetMap",
  other: "Autre",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function ParkDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { communeId } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const { canEditPark } = usePermissions();

  const backTo = `/parks${location.search}`;

  const [tab, setTab] = useState<TabValue>("overview");
  const [infoDirty, setInfoDirty] = useState(false);
  const [featuresDirty, setFeaturesDirty] = useState(false);
  const confirmIfDirty = useUnsavedChangesGuard(infoDirty || featuresDirty);

  const { data: park, isLoading, isError } = useQuery({
    queryKey: ["park", id],
    queryFn: () => getPark(id),
    enabled: !!id,
  });

  // Source réelle (`park_sources.source_type`) — même donnée que la colonne
  // Source de /parks (Admin-UI-5B), affichée ici dans l'entête + la Vue
  // d'ensemble. Un parc a normalement une seule ligne (cf. commentaire de
  // `getParkSourceDistribution`) ; la première est retenue si plusieurs.
  const { data: sources = [] } = useQuery({
    queryKey: ["park-sources", id],
    queryFn: () => listSources(id),
    enabled: !!id,
  });
  const primarySource = sources[0]?.source_type;

  // Mêmes clés react-query que ReviewsPanel/ReportsPanel/ParkEditsPanel — un
  // seul fetch partagé (cache), utilisé ici uniquement pour les petits
  // compteurs réels sur les onglets.
  const { data: reviews = [] } = useQuery({
    queryKey: ["park-reviews", id],
    queryFn: () => listReviewsForPark(id),
    enabled: !!id,
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["park-reports", id],
    queryFn: () => listReportsForPark(id),
    enabled: !!id,
  });
  const { data: edits = [] } = useQuery({
    queryKey: ["park-edits-details", id],
    queryFn: () => listParkEditsWithDetails({ parkId: id }),
    enabled: !!id,
  });
  const openReportsCount = reports.filter((r) => r.status === "open").length;
  const pendingEditsCount = edits.filter((e) => e.status === "pending").length;

  const { run: runStatus, pending: statusPending } = useAsyncAction(
    async (next: Parameters<typeof setParkStatus>[1], note: string) => {
      if (!park) return;
      await setParkStatus(park.id, next, note);
      await logActivity(communeId ?? null, userName, `${note} : ${park.name}`);
      for (const key of [["park", id], ["park-history", id], ["bo-parks-page"], ["bo-parks"], ["dash-parks"], ["shell-pending-parks"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    { successMessage: "Statut du parc mis à jour." },
  );

  async function handleTabChange(next: string) {
    if (next === tab) return;
    if (await confirmIfDirty()) setTab(next as TabValue);
  }

  async function goBack(e: React.MouseEvent) {
    e.preventDefault();
    if (await confirmIfDirty()) navigate(backTo);
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Fiche du parc" />
        <p className={styles.stateBox}>Chargement…</p>
      </div>
    );
  }

  if (isError || !park) {
    return (
      <div>
        <PageHeader title="Parc introuvable" />
        <p className={styles.stateBox}>Ce parc n'existe pas ou n'est pas accessible avec votre compte.</p>
        <div style={{ textAlign: "center" }}>
          <Button variant="secondary" size="sm" onClick={() => navigate(backTo)}>
            Retour à la liste
          </Button>
        </div>
      </div>
    );
  }

  const transitions = canEditPark ? parkStatusTransitions(park.status) : [];

  return (
    <div>
      <nav className={styles.breadcrumb} aria-label="Fil d'Ariane">
        <a href={backTo} onClick={goBack}>
          Mes parcs
        </a>
        <span className={styles.crumbSep} aria-hidden="true">
          ›
        </span>
        <span className={styles.crumbCurrent}>{park.name}</span>
      </nav>

      <div className={styles.header}>
        {park.cover_photo ? (
          <img className={styles.cover} src={park.cover_photo} alt={`Photo de ${park.name}`} />
        ) : (
          <div className={styles.coverEmpty}>Aucune photo</div>
        )}

        <div className={styles.identity}>
          <h1 className={styles.title}>{park.name}</h1>
          <div className={styles.tags}>
            <ParkStatusTag status={park.status} />
            <ParkVerificationTag status={park.verification_status} />
          </div>
          <div className={styles.secondary}>
            {park.formatted_address ?? "Adresse non renseignée"}
          </div>
          <div className={styles.headerMeta}>
            <span>{primarySource ? SOURCE_LABEL[primarySource] : "Source non renseignée"}</span>
            <span aria-hidden="true">·</span>
            <span>Modifié le {dateFmt.format(new Date(park.updated_at))}</span>
          </div>
        </div>

        {transitions.length > 0 && (
          <div className={styles.headerActions}>
            <Menu
              label="Actions du parc"
              align="end"
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.actionsTrigger}
                  disabled={statusPending}
                  aria-label="Actions du parc"
                >
                  …
                </Button>
              }
            >
              {transitions.map((t) => (
                <MenuItem key={t.next} onSelect={() => runStatus(t.next, t.note)}>
                  {t.label}
                </MenuItem>
              ))}
            </Menu>
          </div>
        )}
      </div>

      <Tabs
        label="Sections du parc"
        idBase="park"
        value={tab}
        onValueChange={handleTabChange}
        items={TAB_ORDER.map((t) => {
          if (t.value === "reviews") return { value: t.value, label: tabLabel(t.label, reviews.length) };
          if (t.value === "reports") return { value: t.value, label: tabLabel(t.label, openReportsCount, true) };
          if (t.value === "edits") return { value: t.value, label: tabLabel(t.label, pendingEditsCount, true) };
          return { value: t.value, label: t.label };
        })}
      />

      <TabPanel idBase="park" value="overview" active={tab === "overview"}>
        <OverviewPanel park={park} sources={sources} onNavigateTab={handleTabChange} />
      </TabPanel>
      <TabPanel idBase="park" value="info" active={tab === "info"}>
        <InfoPanel park={park} canEdit={canEditPark} onDirtyChange={setInfoDirty} />
      </TabPanel>
      <TabPanel idBase="park" value="features" active={tab === "features"}>
        <FeaturesPanel park={park} canEdit={canEditPark} onDirtyChange={setFeaturesDirty} />
      </TabPanel>
      <TabPanel idBase="park" value="photos" active={tab === "photos"}>
        <PhotosPanel parkId={park.id} canManage={canEditPark} />
      </TabPanel>
      <TabPanel idBase="park" value="reviews" active={tab === "reviews"}>
        <ReviewsPanel parkId={park.id} />
      </TabPanel>
      <TabPanel idBase="park" value="reports" active={tab === "reports"}>
        <ReportsPanel parkId={park.id} parkName={park.name} />
      </TabPanel>
      <TabPanel idBase="park" value="edits" active={tab === "edits"}>
        <ParkEditsPanel parkId={park.id} parkName={park.name} />
      </TabPanel>
      <TabPanel idBase="park" value="history" active={tab === "history"}>
        <HistoryPanel parkId={park.id} />
      </TabPanel>
    </div>
  );
}
