import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Segmented } from "@toboggo/design-system";
import { listParks, setParkStatus, toCsv, downloadCsv, parseCsv, createPark, logActivity, type Park, type ParkStatus } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkStatusTag } from "../components/StatusTag";
import { ParkModal } from "../components/ParkModal";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { queryClient } from "../lib/queryClient";

export default function Parks() {
  const { isAdmin, communeId } = useOrgScope();
  const { userName, isGestionnaireOrAbove } = useOrgSession();
  const canManage = isAdmin || isGestionnaireOrAbove();
  const [tab, setTab] = useState<"all" | ParkStatus>(isAdmin ? "pending" : "all");
  const [query, setQuery] = useState("");
  const [modalPark, setModalPark] = useState<Park | "new" | null>(null);

  const { data: parks = [], isLoading } = useQuery({ queryKey: ["bo-parks", communeId, isAdmin], queryFn: () => listParks({ communeId }) });

  const filtered = parks
    .filter((p) => tab === "all" || p.status === tab)
    .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.formatted_address ?? "").toLowerCase().includes(query.toLowerCase()));

  const tabs = isAdmin
    ? [
        { value: "pending", label: `En attente (${parks.filter((p) => p.status === "pending").length})` },
        { value: "published", label: "Validés" },
        { value: "rejected", label: "Refusés" },
      ]
    : [
        { value: "all", label: `Tous (${parks.length})` },
        { value: "published", label: "Publiés" },
        { value: "pending", label: `En attente (${parks.filter((p) => p.status === "pending").length})` },
        { value: "draft", label: "Brouillons" },
        { value: "blocked", label: `Bloqués (${parks.filter((p) => p.status === "blocked").length})` },
      ];

  function exportCsv() {
    const csv = toCsv(
      filtered.map((p) => ({ Nom: p.name, Adresse: p.formatted_address, Âge: `${p.age_min}-${p.age_max}`, Statut: p.status })),
      ["Nom", "Adresse", "Âge", "Statut"],
    );
    downloadCsv("toboggo-parcs.csv", csv);
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    let imported = 0;
    for (const row of rows) {
      const name = row["Nom"] || row["name"];
      const address = row["Adresse"] || row["address"];
      if (!name || !address) continue;
      const dup = parks.some((p) => p.name === name && p.formatted_address === address);
      if (dup) continue;
      await createPark({
        name,
        formatted_address: address,
        commune_id: communeId ?? null,
        lat: 45.75,
        lng: 4.85,
        age_min: 0,
        age_max: 12,
        surface: "non_precise",
        status: isGestionnaireOrAbove() ? "published" : "pending",
      } as Partial<Park>);
      imported++;
    }
    await logActivity(communeId ?? null, userName, `${imported} parc(s) importé(s) via CSV`);
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
    e.target.value = "";
  }

  async function quickAction(park: Park, status: ParkStatus, label: string) {
    await setParkStatus(park.id, status, label);
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
  }

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Parcs" : "Mes parcs"}
        actions={
          <>
            {!isAdmin && canManage && (
              <Button size="sm" onClick={() => setModalPark("new")}>
                + Ajouter un parc
              </Button>
            )}
            {!isAdmin && canManage && (
              <label style={{ display: "inline-flex" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "9px 16px",
                    fontSize: 13,
                    fontFamily: "var(--font-heading)",
                    fontWeight: 600,
                    borderRadius: 999,
                    background: "var(--color-surface)",
                    border: "1.5px solid var(--color-border-strong)",
                    cursor: "pointer",
                  }}
                >
                  Importer CSV
                </span>
                <input type="file" accept=".csv" hidden onChange={importCsv} />
              </label>
            )}
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              Exporter CSV
            </Button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented options={tabs as any} value={tab} onChange={(v) => setTab(v as any)} />
        <div style={{ maxWidth: 260 }}>
          <Input placeholder="Nom ou adresse…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <p>Chargement…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>Aucun parc dans cette catégorie.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((park) => (
            <button
              key={park.id}
              onClick={() => setModalPark(park)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: 12,
                background: "var(--color-surface)",
                borderRadius: 12,
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>{park.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                  {park.formatted_address} · {park.age_min}-{park.age_max} ans
                </div>
              </div>
              <ParkStatusTag status={park.status} />
              {park.status === "pending" && canManage && (
                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" onClick={() => quickAction(park, "published", "Validé")}>
                    Valider
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => quickAction(park, "rejected", "Refusé")}>
                    Refuser
                  </Button>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <ParkModal park={modalPark} onClose={() => setModalPark(null)} canManage={canManage} />
    </div>
  );
}
