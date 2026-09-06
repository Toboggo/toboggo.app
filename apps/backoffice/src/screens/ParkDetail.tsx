import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Menu, MenuItem, Tabs, TabPanel, useToast } from "@toboggo/design-system";
import { getPark, logActivity, setParkStatus } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkStatusTag, ParkVerificationTag } from "../components/StatusTag";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { usePermissions } from "../lib/permissions";
import { useAsyncAction } from "../lib/useAsyncAction";
import { useUnsavedChangesGuard } from "../lib/useUnsavedChangesGuard";
import { parkStatusTransitions } from "../lib/parkStatus";
import { queryClient } from "../lib/queryClient";
import { InfoPanel } from "./parkDetail/InfoPanel";
import { PhotosPanel } from "./parkDetail/PhotosPanel";
import { HistoryPanel } from "./parkDetail/HistoryPanel";
import styles from "./ParkDetail.module.css";

type TabValue = "info" | "photos" | "history";
const TABS = [
  { value: "info", label: "Informations" },
  { value: "photos", label: "Photos" },
  { value: "history", label: "Historique" },
] as const;

export default function ParkDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { communeId } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const { canEditPark } = usePermissions();

  const backTo = `/parks${location.search}`;

  const [tab, setTab] = useState<TabValue>("info");
  const [infoDirty, setInfoDirty] = useState(false);
  const confirmIfDirty = useUnsavedChangesGuard(infoDirty);

  const { data: park, isLoading, isError } = useQuery({
    queryKey: ["park", id],
    queryFn: () => getPark(id),
    enabled: !!id,
  });

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
  const secondary =
    park.formatted_address ||
    (park.min_age != null || park.max_age != null
      ? `${park.min_age ?? "?"}–${park.max_age ?? "?"} ans`
      : null);

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
            {park.verification_status !== "unverified" && (
              <ParkVerificationTag status={park.verification_status} />
            )}
          </div>
          {secondary && <div className={styles.secondary}>{secondary}</div>}
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
        items={TABS.map((t) => ({ value: t.value, label: t.label }))}
      />

      <TabPanel idBase="park" value="info" active={tab === "info"}>
        <InfoPanel park={park} canEdit={canEditPark} onDirtyChange={setInfoDirty} />
      </TabPanel>
      <TabPanel idBase="park" value="photos" active={tab === "photos"}>
        <PhotosPanel parkId={park.id} canManage={canEditPark} />
      </TabPanel>
      <TabPanel idBase="park" value="history" active={tab === "history"}>
        <HistoryPanel parkId={park.id} />
      </TabPanel>
    </div>
  );
}
