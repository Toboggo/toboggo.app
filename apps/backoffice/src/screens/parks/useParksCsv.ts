import type { ChangeEvent } from "react";
import { useToast } from "@toboggo/design-system";
import {
  createPark,
  downloadCsv,
  isValidCoordinate,
  listParks,
  logActivity,
  parseCsv,
  toCsv,
  type Park,
} from "@toboggo/shared";
import { useOrgScope } from "../../lib/orgScope";
import { useOrgSession } from "../../lib/orgSession";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { queryClient } from "../../lib/queryClient";

/** An empty/missing CSV cell must never coerce to `0` (a false-looking, but
 * real, coordinate) — treat it as absent so `isValidCoordinate` rejects the
 * row instead of silently accepting "(0, <real longitude>)". */
function parseCoordinateCell(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return NaN;
  return Number(raw);
}

/**
 * CSV export / import of the parks list, shared by the admin list and the
 * collectivité "Mes parcs" (COLL-03) — moved verbatim out of the admin screen
 * so both surfaces behave identically.
 */
export function useParksCsv() {
  const { communeId } = useOrgScope();
  const { userName, isGestionnaireOrAbove } = useOrgSession();
  const toast = useToast();

  /** `keep` narrows the export to the rows the caller is currently showing. */
  function exportCsv(keep: (park: Park) => boolean = () => true) {
    void (async () => {
      try {
        const all = await listParks({ communeId });
        const filtered = all.filter(keep);
        const csv = toCsv(
          filtered.map((p) => ({
            Nom: p.name,
            Adresse: p.formatted_address ?? "",
            Latitude: p.latitude ?? p.lat ?? "",
            Longitude: p.longitude ?? p.lng ?? "",
            Statut: p.status,
            Vérification: p.verification_status,
            Photos: (p.photos ?? []).length,
          })),
          ["Nom", "Adresse", "Latitude", "Longitude", "Statut", "Vérification", "Photos"],
        );
        downloadCsv("toboggo-parcs.csv", csv);
      } catch {
        toast.error("L'export CSV a échoué.");
      }
    })();
  }

  // A row without a real, valid GPS position is skipped rather than created
  // with a placeholder (bug B1) — the collectivité must supply real
  // coordinates, e.g. from the export above or a mapping tool.
  const { run: runImportCsv, pending: importPending } = useAsyncAction(
    async (file: File) => {
      const text = await file.text();
      const csvRows = parseCsv(text);
      const existing = await listParks({ communeId });
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      for (const row of csvRows) {
        const name = row["Nom"] || row["name"];
        const address = row["Adresse"] || row["address"];
        const lat = parseCoordinateCell(row["Latitude"] ?? row["lat"]);
        const lng = parseCoordinateCell(row["Longitude"] ?? row["lng"]);
        if (!name || !address || !isValidCoordinate(lat, lng)) {
          skipped++;
          continue;
        }
        const dup = existing.some((p) => p.name === name && p.formatted_address === address);
        if (dup) {
          skipped++;
          continue;
        }
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
      void queryClient.invalidateQueries({ queryKey: ["bo-parks-page"] });
      void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
      const parts = [`${imported} parc(s) importé(s).`];
      if (skipped) parts.push(`${skipped} ligne(s) ignorée(s) (adresse, doublon ou coordonnées manquantes/invalides).`);
      if (failed) parts.push(`${failed} ligne(s) en échec (erreur serveur) — réessayez-les séparément.`);
      toast.show(parts.join(" "), failed ? "error" : skipped ? "info" : "success");
    },
    { errorMessage: () => "L'import CSV a échoué." },
  );

  async function importCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await runImportCsv(file);
  }

  return { exportCsv, importCsv, importPending };
}
