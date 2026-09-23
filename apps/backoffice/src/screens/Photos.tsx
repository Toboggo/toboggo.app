import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Select, Tabs, TabPanel, Tag, useConfirm, useToast } from "@toboggo/design-system";
import {
  deleteMedia,
  listPendingMedia,
  listProcessedMedia,
  setMediaStatus,
  setParkCover,
  type PendingMedia,
  type SourceType,
} from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { MediaStatusTag } from "../components/StatusTag";
import { useOrgScope } from "../lib/orgScope";
import { usePermissions } from "../lib/permissions";
import { queryClient } from "../lib/queryClient";

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

  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["bo-pending-media", communeId],
    queryFn: () => listPendingMedia({ communeId }),
  });
  const { data: processed = [], isLoading: processedLoading } = useQuery({
    queryKey: ["bo-processed-media", communeId],
    queryFn: () => listProcessedMedia({ communeId }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["bo-pending-media"] });
    void queryClient.invalidateQueries({ queryKey: ["bo-processed-media"] });
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
    void queryClient.invalidateQueries({ queryKey: ["shell-pending-media"] });
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

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10, margin: "14px 0" }}>
        <Input
          label="Rechercher"
          type="search"
          placeholder="Parc, auteur…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 220 }}
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
      </div>

      {!canModerateMedia && (
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: "0 0 14px" }}>
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
    if (isLoading) return <p style={{ color: "var(--color-text-muted)" }}>Chargement…</p>;
    if (filtered.length === 0) {
      return (
        <p style={{ color: "var(--color-text-muted)" }}>
          {tab === "pending" ? "Aucune photo en attente. 🎉" : "Aucune photo traitée ne correspond à ces critères."}
        </p>
      );
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {filtered.map((m) => {
          const prov = provenanceLine(m);
          return (
            <div
              key={m.id}
              style={{ background: "var(--color-surface)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--color-border)" }}
            >
              <a href={m.url} target="_blank" rel="noreferrer">
                <img
                  src={m.url}
                  alt={`Photo proposée pour ${m.park?.name ?? "un parc"}`}
                  style={{ display: "block", width: "100%", height: 200, objectFit: "cover", background: "var(--color-bg-alt)" }}
                />
              </a>
              <div style={{ padding: 12 }}>
                <a
                  href={m.park ? `/parks/${m.park.id}` : undefined}
                  onClick={(e) => {
                    if (!m.park) return;
                    e.preventDefault();
                    navigate(`/parks/${m.park.id}`);
                  }}
                  style={{
                    display: "block",
                    fontWeight: 600,
                    fontSize: 14,
                    color: m.park ? "var(--color-text)" : "var(--color-text-muted)",
                    textDecoration: "none",
                    cursor: m.park ? "pointer" : "default",
                  }}
                >
                  {m.park?.name ?? "Parc inconnu"}
                </a>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 4px" }}>
                  <Tag tone="primary">{SOURCE_LABEL[m.source ?? "other"] ?? "Provenance inconnue"}</Tag>
                  <MediaStatusTag status={m.status} />
                  <Tag>{dateFmt.format(new Date(m.created_at))}</Tag>
                </div>
                {prov && <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", margin: "2px 0 10px" }}>{prov}</div>}

                {canModerateMedia && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: prov ? 0 : 10 }}>
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
