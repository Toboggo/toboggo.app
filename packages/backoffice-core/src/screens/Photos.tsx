import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Select, Tabs, TabPanel, Tag, useConfirm, useToast, FilterBar } from "@toboggo/design-system";
import {
  deleteMedia,
  listProcessedMedia,
  setMediaStatus,
  setParkCover,
  type PendingMedia,
  type SourceType,
} from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { PanelEmpty } from "../components/Panel";
import styles from "../components/Records.module.css";
import { MediaStatusTag } from "../components/StatusTag";
import { useOrgScope } from "../lib/orgScope";
import { usePermissions } from "../lib/permissions";
import { queryClient } from "../lib/queryClient";
import { usePendingMedia } from "../lib/sharedQueries";

// Mêmes libellés que Parks.tsx / ParkDetail.tsx — pas de 2e formulation pour
// les mêmes valeurs de `source_type`. `osm` est exclu des filtres : `park_media`
// n'a jamais de ligne `source = 'osm'` (OSM ne crée jamais de photo — voir
// `ParkMedia.source` dans types.ts), un filtre "OpenStreetMap" serait donc
// toujours vide.
const SOURCE_LABEL: Record<SourceType, string> = {
  user: "Contributeur",
  municipality: "Collectivité",
  toboggo: "Toboggo",
  open_data: "Open data",
  partner: "Partenaire",
  osm: "OpenStreetMap",
  other: "Autre",
};
const SOURCE_VALUES: (SourceType | "all")[] = ["all", "user", "municipality", "toboggo", "open_data", "partner", "other"];

type ProcessedFilter = "all" | "approved" | "rejected";
type TabValue = "pending" | "processed";

/** Auteur/provenance affichable, seulement quand une vraie donnée existe —
 * jamais un "non renseigné" générique pour un champ auxiliaire (contrairement
 * à l'adresse d'un parc, qui est une info primaire ailleurs dans l'app). */
function provenanceLine(m: PendingMedia): string | null {
  const parts: string[] = [];
  if (m.attribution) parts.push(m.attribution);
  else if (m.author) parts.push(m.author);
  else if (m.uploadedByName) parts.push(`Envoyé par ${m.uploadedByName}`);
  if (m.license) parts.push(m.license);
  return parts.length ? parts.join(" · ") : null;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function Photos() {
  const navigate = useNavigate();
  const { communeId } = useOrgScope();
  const { canModerateMedia } = usePermissions();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>("pending");
  const [q, setQ] = useState("");
  const [source, setSource] = useState<SourceType | "all">("all");
  const [processedStatus, setProcessedStatus] = useState<ProcessedFilter>("all");

  const { data: pending = [], isLoading: pendingLoading } = usePendingMedia(communeId);
  const { data: processed = [], isLoading: processedLoading } = useQuery({
    queryKey: ["bo-processed-media", communeId],
    queryFn: () => listProcessedMedia({ communeId }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["bo-pending-media"] });
    void queryClient.invalidateQueries({ queryKey: ["bo-processed-media"] });
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
  }

  async function run(id: string, fn: () => Promise<void>, successMessage: string) {
    if (busy) return;
    setBusy(id);
    try {
      await fn();
      refresh();
      toast.success(successMessage);
    } catch (err: any) {
      toast.error(err?.message ?? "Action impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function approve(m: PendingMedia, asCover: boolean) {
    await setMediaStatus(m.id, "approved");
    if (asCover) await setParkCover(m.park_id, m.id);
  }

  async function removePhoto(m: PendingMedia) {
    const ok = await confirm({
      title: "Supprimer cette photo",
      message: "Supprimer définitivement cette photo ? Cette action ne peut pas être annulée.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (ok) await run(m.id, () => deleteMedia(m.id), "Photo supprimée.");
  }

  const list = tab === "pending" ? pending : processed;
  const isLoading = tab === "pending" ? pendingLoading : processedLoading;

  const filtered = list
    .filter((m) => source === "all" || m.source === source)
    .filter((m) => tab === "pending" || processedStatus === "all" || m.status === processedStatus)
    .filter((m) => {
      if (!q) return true;
      const needle = q.toLowerCase();
      return (
        (m.park?.name ?? "").toLowerCase().includes(needle) ||
        (m.author ?? "").toLowerCase().includes(needle) ||
        (m.uploadedByName ?? "").toLowerCase().includes(needle)
      );
    });

  return (
    <div>
      <PageHeader
        title="Photos"
        subtitle="Les photos envoyées par les parents attendent une validation avant d'être publiées."
      />

      <Tabs
        label="Vue des photos"
        idBase="photos"
        value={tab}
        onValueChange={(v) => setTab(v as TabValue)}
        items={[
          { value: "pending", label: `À traiter (${pending.length})` },
          { value: "processed", label: `Traitées (${processed.length})` },
        ]}
      />

      <FilterBar className={styles.afterTabs}>
        <Input
          label="Rechercher"
          type="search"
          placeholder="Parc, auteur…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select label="Source" value={source} onChange={(e) => setSource(e.target.value as SourceType | "all")}>
          {SOURCE_VALUES.map((v) => (
            <option key={v} value={v}>
              {v === "all" ? "Toutes sources" : SOURCE_LABEL[v]}
            </option>
          ))}
        </Select>
        {tab === "processed" && (
          <Select
            label="Statut"
            value={processedStatus}
            onChange={(e) => setProcessedStatus(e.target.value as ProcessedFilter)}
          >
            <option value="all">Tous statuts</option>
            <option value="approved">Approuvées</option>
            <option value="rejected">Refusées</option>
          </Select>
        )}
      </FilterBar>

      {!canModerateMedia && (
        <p className={styles.note}>
          Vous n'avez pas les droits pour modérer les photos — vue en lecture seule.
        </p>
      )}

      <TabPanel idBase="photos" value="pending" active={tab === "pending"}>
        {renderGrid()}
      </TabPanel>
      <TabPanel idBase="photos" value="processed" active={tab === "processed"}>
        {renderGrid()}
      </TabPanel>
    </div>
  );

  function renderGrid() {
    if (isLoading) return <p className={styles.empty}>Chargement…</p>;
    if (filtered.length === 0) {
      return (
        <PanelEmpty
          icon={tab === "pending" ? "ic-check" : "ic-camera"}
          text={tab === "pending" ? "Aucune photo en attente." : "Aucune photo traitée ne correspond à ces critères."}
        />
      );
    }
    return (
      <div className={styles.mediaGrid}>
        {filtered.map((m) => {
          const prov = provenanceLine(m);
          return (
            <div key={m.id} className={styles.mediaCard}>
              <a href={m.url} target="_blank" rel="noreferrer">
                <img
                  src={m.url}
                  alt={`Photo proposée pour ${m.park?.name ?? "un parc"}`}
                  className={styles.mediaImg}
                />
              </a>
              <div className={styles.mediaBody}>
                <a
                  href={m.park ? `/parks/${m.park.id}` : undefined}
                  onClick={(e) => {
                    if (!m.park) return;
                    e.preventDefault();
                    navigate(`/parks/${m.park.id}`);
                  }}
                  className={m.park ? styles.mediaPark : `${styles.mediaPark} ${styles.mediaParkMuted}`}
                >
                  {m.park?.name ?? "Parc inconnu"}
                </a>
                <div className={styles.chips} style={{ margin: "6px 0 4px" }}>
                  <Tag tone="neutral">{SOURCE_LABEL[m.source ?? "other"] ?? "Provenance inconnue"}</Tag>
                  <MediaStatusTag status={m.status} />
                  <Tag>{dateFmt.format(new Date(m.created_at))}</Tag>
                </div>
                {prov && <div className={styles.mediaProv}>{prov}</div>}

                {canModerateMedia && (
                  <div className={styles.actions} style={{ marginTop: prov ? 0 : 10 }}>
                    {tab === "pending" ? (
                      <>
                        <Button size="sm" disabled={!!busy} onClick={() => run(m.id, () => approve(m, false), "Photo approuvée.")}>
                          Approuver
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!busy}
                          onClick={() => run(m.id, () => approve(m, true), "Photo approuvée et définie comme couverture.")}
                        >
                          Approuver + couverture
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!!busy}
                          onClick={() => run(m.id, () => setMediaStatus(m.id, "rejected"), "Photo refusée.")}
                        >
                          Refuser
                        </Button>
                        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => removePhoto(m)}>
                          Supprimer
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => removePhoto(m)}>
                        Supprimer
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}
