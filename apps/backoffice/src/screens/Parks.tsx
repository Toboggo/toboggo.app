import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Segmented, useToast } from "@toboggo/design-system";
import {
  isValidCoordinate,
  listParks,
  setParkStatus,
  toCsv,
  downloadCsv,
  parseCsv,
  createPark,
  logActivity,
  type Park,
  type ParkStatus,
} from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkStatusTag } from "../components/StatusTag";
import { ParkModal } from "../components/ParkModal";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { usePermissions } from "../lib/permissions";
import { useAsyncAction } from "../lib/useAsyncAction";
import { queryClient } from "../lib/queryClient";

/** An empty/missing CSV cell must never coerce to `0` (a false-looking, but
 * real, coordinate) — treat it as absent so `isValidCoordinate` rejects the
 * row instead of silently accepting "(0, <real longitude>)". */
function parseCoordinateCell(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return NaN;
  return Number(raw);
}

const VALID_TAB_VALUES = new Set(["all", "draft", "pending", "published", "blocked", "rejected"]);

/** Validates the `?status=` query param (e.g. from a Dashboard "État des
 * parcs" card) against real tab values instead of trusting an arbitrary URL —
 * an unrecognised value falls back to `undefined` rather than corrupting the
 * screen's filter state. */
function parseStatusParam(raw: string | null): ("all" | ParkStatus) | undefined {
  return raw != null && VALID_TAB_VALUES.has(raw) ? (raw as "all" | ParkStatus) : undefined;
}

export default function Parks() {
  const { isAdmin, communeId } = useOrgScope();
  const { userName, isGestionnaireOrAbove } = useOrgSession();
  const { canCreatePark, canImportParksCsv, canEditPark } = usePermissions();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  // Read once on mount (from a Dashboard/header link) — the URL is not kept
  // in sync afterwards as the user changes filters, matching the minimal
  // scope of this lot (no full router-driven filter state).
  const [tab, setTab] = useState<"all" | ParkStatus>(
    () => parseStatusParam(searchParams.get("status")) ?? (isAdmin ? "pending" : "all"),
  );
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
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
      filtered.map((p) => ({
        Nom: p.name,
        Adresse: p.formatted_address,
        Latitude: p.latitude ?? p.lat ?? "",
        Longitude: p.longitude ?? p.lng ?? "",
        Âge: `${p.age_min}-${p.age_max}`,
        Statut: p.status,
      })),
      ["Nom", "Adresse", "Latitude", "Longitude", "Âge", "Statut"],
    );
    downloadCsv("toboggo-parcs.csv", csv);
  }

  // A row without a real, valid GPS position is skipped rather than created
  // with a placeholder (bug B1) — the collectivité must supply real
  // coordinates, e.g. from the export above or a mapping tool.
  const { run: runImportCsv, pending: importPending } = useAsyncAction(
    async (file: File) => {
      const text = await file.text();
      const rows = parseCsv(text);
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      for (const row of rows) {
        const name = row["Nom"] || row["name"];
        const address = row["Adresse"] || row["address"];
        const lat = parseCoordinateCell(row["Latitude"] ?? row["lat"]);
        const lng = parseCoordinateCell(row["Longitude"] ?? row["lng"]);
        if (!name || !address || !isValidCoordinate(lat, lng)) {
          skipped++;
          continue;
        }
        const dup = parks.some((p) => p.name === name && p.formatted_address === address);
        if (dup) {
          skipped++;
          continue;
        }
        // A single row's failure (e.g. a transient error linking the park to
        // the collectivité — createPark now throws instead of swallowing
        // that, see bug B2) must not abort the rest of the batch, and must
        // never look like a silent success.
        try {
          await createPark({
            name,
            formatted_address: address,
            commune_id: communeId ?? null,
            latitude: lat,
            longitude: lng,
            age_min: 0,
            age_max: 12,
            surface: "non_precise",
            status: isGestionnaireOrAbove() ? "published" : "pending",
          } as Partial<Park>);
          imported++;
        } catch {
          failed++;
        }
      }
      await logActivity(
        communeId ?? null,
        userName,
        `${imported} parc(s) importé(s) via CSV${skipped ? ` (${skipped} ligne(s) ignorée(s))` : ""}${failed ? ` (${failed} échec(s))` : ""}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
      const parts = [`${imported} parc(s) importé(s).`];
      if (skipped) parts.push(`${skipped} ligne(s) ignorée(s) (adresse, doublon ou coordonnées manquantes/invalides).`);
      if (failed) parts.push(`${failed} ligne(s) en échec (erreur serveur) — réessayez-les séparément.`);
      toast.show(parts.join(" "), failed ? "error" : skipped ? "info" : "success");
    },
    { errorMessage: () => "L'import CSV a échoué." },
  );

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await runImportCsv(file);
  }

  const { run: quickAction, pending: quickActionPending } = useAsyncAction(
    async (park: Park, status: ParkStatus, label: string) => {
      await setParkStatus(park.id, status, label);
      void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
    },
    { successMessage: "Statut du parc mis à jour." },
  );

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Parcs" : "Mes parcs"}
        actions={
          <>
            {canCreatePark && (
              <Button size="sm" onClick={() => setModalPark("new")}>
                + Ajouter un parc
              </Button>
            )}
            {canImportParksCsv && (
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
                    cursor: importPending ? "default" : "pointer",
                    opacity: importPending ? 0.6 : 1,
                  }}
                >
                  {importPending ? "Import en cours…" : "Importer CSV"}
                </span>
                <input type="file" accept=".csv" hidden disabled={importPending} onChange={importCsv} />
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
              {park.status === "pending" && canEditPark && (
                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" disabled={quickActionPending} onClick={() => quickAction(park, "published", "Validé")}>
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={quickActionPending}
                    onClick={() => quickAction(park, "rejected", "Refusé")}
                  >
                    Refuser
                  </Button>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {modalPark && <ParkModal park={modalPark} onClose={() => setModalPark(null)} canManage={canEditPark} />}
    </div>
  );
}
