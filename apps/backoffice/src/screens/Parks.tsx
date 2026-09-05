import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Button,
  DataTable,
  Input,
  Menu,
  MenuItem,
  Select,
  useToast,
  type DataTableColumn,
} from "@toboggo/design-system";
import {
  isValidCoordinate,
  listParks,
  listParksPage,
  setParkStatus,
  toCsv,
  downloadCsv,
  parseCsv,
  createPark,
  logActivity,
  PARKS_PAGE_SIZE,
  type Park,
  type ParkStatus,
  type ParksSortKey,
  type VerificationStatus,
} from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkStatusTag, ParkVerificationTag } from "../components/StatusTag";
import { ParkModal } from "../components/ParkModal";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { usePermissions } from "../lib/permissions";
import { useAsyncAction } from "../lib/useAsyncAction";
import { queryClient } from "../lib/queryClient";
import styles from "./Parks.module.css";

/** An empty/missing CSV cell must never coerce to `0` (a false-looking, but
 * real, coordinate) — treat it as absent so `isValidCoordinate` rejects the
 * row instead of silently accepting "(0, <real longitude>)". */
function parseCoordinateCell(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return NaN;
  return Number(raw);
}

const STATUS_VALUES: (ParkStatus | "all")[] = ["all", "draft", "pending", "published", "blocked", "rejected"];
const STATUS_LABEL: Record<ParkStatus | "all", string> = {
  all: "Tous les statuts",
  draft: "Brouillon",
  pending: "En attente",
  published: "Publié",
  blocked: "Bloqué",
  rejected: "Refusé",
};

const VERIFICATION_VALUES: (VerificationStatus | "all")[] = [
  "all",
  "unverified",
  "community_verified",
  "organization_verified",
  "toboggo_verified",
];
const VERIFICATION_LABEL: Record<VerificationStatus | "all", string> = {
  all: "Toutes vérifications",
  unverified: "Non vérifié",
  community_verified: "Vérifié communauté",
  organization_verified: "Vérifié collectivité",
  toboggo_verified: "Vérifié Toboggo",
};

const SORT_KEYS: ParksSortKey[] = ["name", "created_at", "updated_at"];
const DEFAULT_SORT = "-updated_at";

function parseSort(raw: string | null): { key: ParksSortKey; order: "asc" | "desc" } {
  const value = raw || DEFAULT_SORT;
  const order: "asc" | "desc" = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^-/, "") as ParksSortKey;
  return SORT_KEYS.includes(key) ? { key, order } : { key: "updated_at", order: "desc" };
}

function parkMeta(park: Park): string | null {
  if (park.formatted_address) return park.formatted_address;
  if (park.min_age != null || park.max_age != null) {
    if (park.min_age != null && park.max_age != null) return `de ${park.min_age} à ${park.max_age} ans`;
    if (park.min_age != null) return `dès ${park.min_age} ${park.min_age > 1 ? "ans" : "an"}`;
    return `jusqu'à ${park.max_age} ans`;
  }
  return null;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function Parks() {
  const { isAdmin, communeId } = useOrgScope();
  const { userName, isGestionnaireOrAbove } = useOrgSession();
  const { canCreatePark, canImportParksCsv, canEditPark } = usePermissions();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalPark, setModalPark] = useState<Park | "new" | null>(null);

  const defaultStatus: ParkStatus | "all" = isAdmin ? "pending" : "all";
  const statusParam = searchParams.get("status");
  const status: ParkStatus | "all" =
    statusParam && STATUS_VALUES.includes(statusParam as ParkStatus | "all")
      ? (statusParam as ParkStatus | "all")
      : defaultStatus;
  const verificationParam = searchParams.get("verification");
  const verification: VerificationStatus | "all" =
    verificationParam && VERIFICATION_VALUES.includes(verificationParam as VerificationStatus | "all")
      ? (verificationParam as VerificationStatus | "all")
      : "all";
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const sort = parseSort(searchParams.get("sort"));

  const hasActiveFilters = q !== "" || status !== defaultStatus || verification !== "all";

  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput.trim() !== q) updateParams({ q: qInput.trim() || null }, { resetPage: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  function updateParams(next: Record<string, string | null>, opts: { resetPage?: boolean } = {}) {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    if (opts.resetPage) p.delete("page");
    setSearchParams(p, { replace: true });
  }

  function resetFilters() {
    setQInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["bo-parks-page", { communeId, isAdmin, q, status, verification, page, sort }],
    queryFn: () =>
      listParksPage({
        communeId,
        q,
        status: status === "all" ? undefined : [status],
        verification: verification === "all" ? undefined : [verification],
        sort: sort.key,
        order: sort.order,
        page,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;

  function exportCsv() {
    void (async () => {
      try {
        const all = await listParks({ communeId });
        const filtered = all
          .filter((p) => status === "all" || p.status === status)
          .filter((p) => verification === "all" || p.verification_status === verification)
          .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
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

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await runImportCsv(file);
  }

  const { run: runStatus, pending: statusPending } = useAsyncAction(
    async (park: Park, next: ParkStatus, label: string) => {
      await setParkStatus(park.id, next, label);
      for (const key of [["bo-parks-page"], ["bo-parks"], ["dash-parks"], ["shell-pending-parks"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    { successMessage: "Statut du parc mis à jour." },
  );

  function statusActions(park: Park): { label: string; run: () => void }[] {
    if (!canEditPark) return [];
    switch (park.status) {
      case "pending":
        return [
          { label: "Valider", run: () => runStatus(park, "published", "Validé") },
          { label: "Refuser", run: () => runStatus(park, "rejected", "Refusé") },
        ];
      case "published":
        return [{ label: "Bloquer", run: () => runStatus(park, "blocked", "Bloqué") }];
      case "blocked":
        return [{ label: "Débloquer", run: () => runStatus(park, "published", "Débloqué") }];
      default:
        return [];
    }
  }

  const columns: DataTableColumn<Park>[] = [
    {
      key: "name",
      header: "Parc",
      sortable: true,
      render: (park) => (
        <>
          <span className={styles.parkName}>{park.name}</span>
          <span className={styles.parkMeta}>{parkMeta(park) ?? "Non renseigné"}</span>
        </>
      ),
    },
    { key: "status", header: "Statut", width: "1px", render: (park) => <ParkStatusTag status={park.status} /> },
    {
      key: "verification",
      header: "Vérification",
      width: "1px",
      render: (park) => <ParkVerificationTag status={park.verification_status} />,
    },
    {
      key: "reports",
      header: "Signalement",
      width: "1px",
      align: "center",
      render: (park) =>
        park.has_open_report ? (
          <span className={styles.reportFlag}>
            <span className={styles.reportDot} aria-hidden="true" />
            Ouvert
          </span>
        ) : (
          <span className={styles.muted}>—</span>
        ),
    },
    {
      key: "photos",
      header: "Photos",
      width: "1px",
      align: "center",
      render: (park) => {
        const n = (park.photos ?? []).length;
        return <span className={n ? styles.photoCount : `${styles.photoCount} ${styles.muted}`}>{n}</span>;
      },
    },
    {
      key: "updated_at",
      header: "Modifié le",
      width: "1px",
      align: "right",
      sortable: true,
      render: (park) => <span className={styles.date}>{dateFmt.format(new Date(park.updated_at))}</span>,
    },
    {
      key: "actions",
      header: "",
      width: "1px",
      align: "right",
      render: (park) => {
        const actions = statusActions(park);
        return (
          <div className={styles.rowActions} data-dt-stop>
            <Menu
              label={`Actions — ${park.name}`}
              align="end"
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.actionsTrigger}
                  disabled={statusPending}
                  aria-label={`Actions — ${park.name}`}
                >
                  …
                </Button>
              }
            >
              <MenuItem onSelect={() => setModalPark(park)}>Ouvrir la fiche</MenuItem>
              {actions.map((a) => (
                <MenuItem key={a.label} onSelect={a.run}>
                  {a.label}
                </MenuItem>
              ))}
            </Menu>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Parcs" : "Mes parcs"}
        actions={
          <>
            {canCreatePark && (
              <Button size="sm" onClick={() => setModalPark("new")}>
                Ajouter un parc
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

      <div className={styles.filterBar}>
        <Input
          className={styles.search}
          label="Rechercher"
          type="search"
          placeholder="Nom du parc…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <Select
          className={styles.select}
          label="Statut"
          value={status}
          onChange={(e) => updateParams({ status: e.target.value === defaultStatus ? null : e.target.value }, { resetPage: true })}
        >
          {STATUS_VALUES.map((v) => (
            <option key={v} value={v}>
              {STATUS_LABEL[v]}
            </option>
          ))}
        </Select>
        <Select
          className={styles.select}
          label="Vérification"
          value={verification}
          onChange={(e) => updateParams({ verification: e.target.value === "all" ? null : e.target.value }, { resetPage: true })}
        >
          {VERIFICATION_VALUES.map((v) => (
            <option key={v} value={v}>
              {VERIFICATION_LABEL[v]}
            </option>
          ))}
        </Select>
        {hasActiveFilters && (
          <button type="button" className={styles.reset} onClick={resetFilters}>
            Réinitialiser
          </button>
        )}
        {!isLoading && !isError && (
          <span className={styles.count}>
            {total} parc{total > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <DataTable
        caption={isAdmin ? "Liste des parcs" : "Liste de mes parcs"}
        columns={columns}
        rows={rows}
        getRowKey={(park) => park.id}
        onRowClick={(park) => setModalPark(park)}
        rowLabel={(park) => `Ouvrir la fiche de ${park.name}`}
        sort={{ key: sort.key, order: sort.order }}
        onSortChange={(next) => {
          const encoded = `${next.order === "desc" ? "-" : ""}${next.key}`;
          updateParams({ sort: encoded === DEFAULT_SORT ? null : encoded }, { resetPage: true });
        }}
        state={isError ? "error" : isLoading ? "loading" : "ready"}
        loadingRows={Math.min(PARKS_PAGE_SIZE, 8)}
        error={
          <>
            <p>Impossible de charger les parcs.</p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              Réessayer
            </Button>
          </>
        }
        empty={
          hasActiveFilters ? (
            <>
              <p>Aucun parc ne correspond à ces critères.</p>
              <Button size="sm" variant="secondary" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            </>
          ) : (
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 600, color: "var(--color-text)" }}>
                Aucun parc rattaché
              </p>
              <p style={{ marginTop: 4 }}>
                {canCreatePark
                  ? "Ajoutez un parc ou importez votre patrimoine depuis un fichier CSV."
                  : "Aucun parc n'est rattaché à cette organisation."}
              </p>
              {canCreatePark && (
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                  <Button size="sm" onClick={() => setModalPark("new")}>
                    Ajouter un parc
                  </Button>
                </div>
              )}
            </div>
          )
        }
      />

      {pageCount > 1 && (
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerBtn}
            disabled={page <= 1}
            onClick={() => updateParams({ page: page - 1 <= 1 ? null : String(page - 1) })}
          >
            Précédent
          </button>
          <span>
            Page {page} / {pageCount}
          </span>
          <button
            type="button"
            className={styles.pagerBtn}
            disabled={page >= pageCount}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Suivant
          </button>
        </div>
      )}

      {modalPark && <ParkModal park={modalPark} onClose={() => setModalPark(null)} canManage={canEditPark} />}
    </div>
  );
}
