import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Chip,
  DataTable,
  EmptyState,
  Icon,
  Input,
  Menu,
  MenuItem,
  Select,
  Skeleton,
  StatCard,
  Tag,
  type DataTableColumn,
} from "@toboggo/design-system";
import { setParkStatus, type Park, type ParkStatus } from "@toboggo/shared";
import { panelStyles } from "../../components/Panel";
import { ParkStatusTag, ParkVerificationTag } from "../../components/StatusTag";
import {
  COMMUNE_PAGE_SIZE,
  NO_FILTERS,
  filterParkRows,
  hasActiveFilters,
  paginate,
  sortParkRows,
  summarizeParks,
  useCommuneParks,
  type CommuneSortKey,
  type ParkFilters,
  type ParkRow,
} from "../../lib/communeParks";
import { useOrgScope } from "../../lib/orgScope";
import { useOrgSession } from "../../lib/orgSession";
import { usePermissions } from "../../lib/permissions";
import { operationalAttention, parkStatusTransitions } from "../../lib/parkStatus";
import { queryClient } from "../../lib/queryClient";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useParksCsv } from "./useParksCsv";
import styles from "./CommuneParks.module.css";

const STATUS_VALUES: (ParkStatus | "all")[] = ["all", "published", "pending", "draft", "blocked", "rejected"];
const STATUS_LABEL: Record<ParkStatus | "all", string> = {
  all: "Tous les statuts",
  draft: "Brouillon",
  pending: "En attente",
  published: "Publié",
  blocked: "Bloqué",
  rejected: "Refusé",
};

const SORT_KEYS: CommuneSortKey[] = ["name", "updated_at"];
const DEFAULT_SORT = "name";
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

function parseSort(raw: string | null): { key: CommuneSortKey; order: "asc" | "desc" } {
  const value = raw || DEFAULT_SORT;
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^-/, "") as CommuneSortKey;
  return SORT_KEYS.includes(key) ? { key, order } : { key: "name", order: "asc" };
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}

/** Second line under the park name: its real address, else its recorded age
 * range, else nothing — never a repeated "non renseigné". */
function parkMeta(park: Park): string | null {
  if (park.formatted_address) return park.formatted_address;
  if (park.min_age != null && park.max_age != null) return `de ${park.min_age} à ${park.max_age} ans`;
  if (park.min_age != null) return `dès ${park.min_age} ${park.min_age > 1 ? "ans" : "an"}`;
  if (park.max_age != null) return `jusqu'à ${park.max_age} ans`;
  return null;
}

function StatusCell({ row }: { row: ParkRow }) {
  const attention = operationalAttention(row.park.operational_status);
  return (
    <div className={styles.tags}>
      <ParkStatusTag status={row.park.status} />
      {attention && <Tag tone={attention.tone}>{attention.label}</Tag>}
      {row.park.verification_status !== "unverified" && <ParkVerificationTag status={row.park.verification_status} />}
    </div>
  );
}

function ToTreat({ row, editsUnavailable }: { row: ParkRow; editsUnavailable: boolean }) {
  if (!row.openReport && row.pendingEdits === 0) {
    // Nothing to do (or, if the proposals could not load, nothing known).
    return <span className={styles.muted} aria-label={editsUnavailable ? "Indisponible" : "Rien à traiter"}>—</span>;
  }
  return (
    <div className={styles.pills}>
      {row.openReport && (
        <span className={styles.pill}>
          <Icon name="ic-flag" size={12} />
          Signalement
        </span>
      )}
      {row.pendingEdits > 0 && (
        <span className={styles.pill}>
          <Icon name="ic-question" size={12} />
          {row.pendingEdits} info{row.pendingEdits > 1 ? "s" : ""} à vérifier
        </span>
      )}
    </div>
  );
}

/** "N / 5 renseignées" + "X à compléter" — an action indicator, never a score. */
function CompletenessCell({ row }: { row: ParkRow }) {
  const { filled, total, missing, items } = row.completeness;
  const label = `${filled} / ${total} informations renseignées`;
  const todo = items.filter((i) => !i.done).map((i) => i.label);
  return (
    <div className={styles.completeness} title={missing.length ? `À compléter : ${todo.join(", ")}` : "Toutes les informations sont renseignées"}>
      <span className={styles.completenessMain} aria-label={label}>
        {filled} / {total} renseignées
      </span>
      {missing.length > 0 ? (
        <span className={styles.completenessTodo}>
          {missing.length} à compléter
        </span>
      ) : (
        <span className={styles.completenessDone}>
          <Icon name="ic-check" size={12} />
          Complet
        </span>
      )}
    </div>
  );
}

export function CommuneParks() {
  const { communeId } = useOrgScope();
  const orgName = useOrgSession((s) => s.communes.find((c) => c.id === communeId)?.name);
  const { canCreatePark, canImportParksCsv, canEditPark } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const narrow = useMediaQuery("(max-width: 860px)");
  const fileInput = useRef<HTMLInputElement>(null);

  const { rows, isLoading, isError, editsUnavailable, refetch } = useCommuneParks(communeId);
  const { exportCsv, importCsv, importPending } = useParksCsv();

  // ── État dans l'URL ───────────────────────────────────────────────────────
  const statusParam = searchParams.get("status");
  const filters: ParkFilters = {
    q: searchParams.get("q")?.trim() ?? "",
    status: STATUS_VALUES.includes(statusParam as ParkStatus | "all") ? (statusParam as ParkStatus | "all") : "all",
    report: searchParams.get("report") === "1",
    incomplete: searchParams.get("incomplete") === "1",
    edits: searchParams.get("edits") === "1",
  };
  const sort = parseSort(searchParams.get("sort"));
  const pageParam = Math.max(1, Number(searchParams.get("page")) || 1);

  function updateParams(next: Record<string, string | null>, opts: { resetPage?: boolean } = {}) {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    if (opts.resetPage) p.delete("page");
    setSearchParams(p, { replace: true });
  }
  const toggle = (key: "report" | "incomplete" | "edits", on: boolean) =>
    updateParams({ [key]: on ? "1" : null }, { resetPage: true });

  // Typing stays local (so spaces are not trimmed away mid-word); the URL —
  // and the filter — follows after a short pause.
  const [qInput, setQInput] = useState(filters.q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput.trim() !== filters.q) updateParams({ q: qInput.trim() || null }, { resetPage: true });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  function resetFilters() {
    setQInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  function openPark(park: Park) {
    const qs = searchParams.toString();
    navigate(`/parks/${park.id}${qs ? `?${qs}` : ""}`);
  }

  // ── Dérivations (toutes issues de lignes réelles) ──────────────────────────
  const summary = summarizeParks(rows);
  const filtered = sortParkRows(filterParkRows(rows, filters), sort.key, sort.order);
  const { items: pageRows, page, pageCount } = paginate(filtered, pageParam);
  const active = hasActiveFilters(filters);

  const { run: runStatus, pending: statusPending } = useAsyncAction(
    async (park: Park, next: ParkStatus, note: string) => {
      await setParkStatus(park.id, next, note);
      for (const key of [["bo-parks"], ["bo-parks-page"], ["dash-parks"], ["shell-pending-parks"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    { successMessage: "Statut du parc mis à jour." },
  );

  function rowActions(row: ParkRow) {
    const label = `Actions — ${row.park.name}`;
    const transitions = canEditPark ? parkStatusTransitions(row.park.status) : [];
    return (
      <div className={styles.rowActions} data-dt-stop>
        <Menu
          label={label}
          align="end"
          trigger={
            <Button variant="ghost" size="sm" className={styles.actionsTrigger} disabled={statusPending} aria-label={label}>
              …
            </Button>
          }
        >
          <MenuItem onSelect={() => openPark(row.park)}>Ouvrir la fiche</MenuItem>
          {transitions.map((t) => (
            <MenuItem key={t.next} onSelect={() => runStatus(row.park, t.next, t.note)}>
              {t.label}
            </MenuItem>
          ))}
        </Menu>
      </div>
    );
  }

  const columns: DataTableColumn<ParkRow>[] = [
    {
      key: "name",
      header: "Parc",
      sortable: true,
      render: ({ park }) => (
        <>
          <span className={styles.parkName}>{park.name}</span>
          {parkMeta(park) && <span className={styles.parkMeta}>{parkMeta(park)}</span>}
        </>
      ),
    },
    { key: "status", header: "Statut", render: (row) => <StatusCell row={row} /> },
    { key: "toTreat", header: "À traiter", render: (row) => <ToTreat row={row} editsUnavailable={editsUnavailable} /> },
    { key: "completeness", header: "Complétude", render: (row) => <CompletenessCell row={row} /> },
    {
      key: "photos",
      header: "Photos",
      width: "1px",
      align: "center",
      render: ({ park }) => {
        const n = (park.photos ?? []).length;
        return <span className={n ? styles.num : `${styles.num} ${styles.muted}`}>{n}</span>;
      },
    },
    {
      key: "updated_at",
      header: "Modifié",
      width: "1px",
      align: "right",
      sortable: true,
      render: ({ park }) => <span className={styles.date}>{dateFmt.format(new Date(park.updated_at))}</span>,
    },
    { key: "actions", header: "", width: "1px", align: "right", render: rowActions },
  ];

  // ── Rendus ───────────────────────────────────────────────────────────────
  const subtitle = isLoading || isError ? orgName : [orgName, `${summary.total} parc${plural(summary.total, "", "s")}`].filter(Boolean).join(" · ");

  const header = (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Mes parcs</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <div className={styles.headerActions}>
        {canCreatePark && (
          <Button size="sm" onClick={() => navigate("/parks/new")}>
            Ajouter un parc
          </Button>
        )}
        <Menu
          label="Import et export"
          align="end"
          trigger={
            <Button variant="secondary" size="sm" disabled={importPending}>
              {importPending ? "Import en cours…" : "Import / export"}
            </Button>
          }
        >
          {canImportParksCsv && <MenuItem onSelect={() => fileInput.current?.click()}>Importer un CSV</MenuItem>}
          <MenuItem onSelect={() => exportCsv((p) => filtered.some((r) => r.park.id === p.id))}>
            Exporter en CSV{active ? " (résultats filtrés)" : ""}
          </MenuItem>
        </Menu>
        <input ref={fileInput} type="file" accept=".csv" hidden disabled={importPending} onChange={importCsv} aria-label="Importer un fichier CSV" />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className={styles.page} aria-busy="true">
        {header}
        <div className={styles.kpiStrip}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={panelStyles.neutralCard}>
              <Skeleton width={90} height={12} />
              <div className={styles.skeletonGap}>
                <Skeleton width={56} height={26} />
              </div>
            </div>
          ))}
        </div>
        <div className={panelStyles.neutralCard}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.skeletonRow}>
              <Skeleton width="100%" height={34} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        {header}
        <div className={panelStyles.neutralCard}>
          <div className={styles.stateBox}>
            <p>Impossible de charger les parcs.</p>
            <Button size="sm" variant="secondary" onClick={refetch}>
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={styles.page}>
        {header}
        <div className={panelStyles.neutralCard}>
          <EmptyState
            iconName="ic-list"
            title="Aucun parc rattaché"
            description={
              canCreatePark
                ? "Ajoutez un parc ou importez votre patrimoine depuis un fichier CSV."
                : "Aucun parc n'est rattaché à votre collectivité pour le moment."
            }
          />
          {canCreatePark && (
            <div className={styles.emptyActions}>
              <Button size="sm" onClick={() => navigate("/parks/new")}>
                Ajouter un parc
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const emptyFiltered = (
    <>
      <p>Aucun parc ne correspond à ces critères.</p>
      <Button size="sm" variant="secondary" onClick={resetFilters}>
        Réinitialiser les filtres
      </Button>
    </>
  );

  return (
    <div className={styles.page}>
      {header}

      <div className={styles.kpiStrip}>
        <StatCard
          layout="inline"
          value={`${summary.published} / ${summary.total}`}
          label={`Parc${plural(summary.published, "", "s")} publié${plural(summary.published, "", "s")}`}
          icon="ic-check"
          tone="primary"
          emphasized
          onClick={() => updateParams({ status: "published" }, { resetPage: true })}
        />
        <StatCard
          layout="inline"
          value={summary.withOpenReport}
          label={plural(summary.withOpenReport, "Signalement ouvert", "Signalements ouverts")}
          secondary={
            summary.withOpenReport > 0
              ? `${summary.withOpenReport} parc${plural(summary.withOpenReport, "", "s")} concerné${plural(summary.withOpenReport, "", "s")}`
              : undefined
          }
          icon="ic-flag"
          tone={summary.withOpenReport > 0 ? "warning" : "neutral"}
          emphasized
          onClick={() => toggle("report", true)}
        />
        <StatCard
          layout="inline"
          value={summary.incomplete}
          label={`${plural(summary.incomplete, "Parc à compléter", "Parcs à compléter")}`}
          icon="ic-list"
          emphasized
          secondary={
            summary.missingTotal > 0
              ? `${summary.missingTotal} information${plural(summary.missingTotal, "", "s")} à compléter`
              : undefined
          }
          onClick={() => toggle("incomplete", true)}
        />
        <StatCard
          layout="inline"
          value={editsUnavailable ? "—" : summary.pendingEdits}
          label="Infos à vérifier"
          icon="ic-question"
          tone={!editsUnavailable && summary.pendingEdits > 0 ? "warning" : "neutral"}
          emphasized
          secondary={
            editsUnavailable
              ? "Indisponible pour le moment"
              : summary.parksWithEdits > 0
                ? `sur ${summary.parksWithEdits} parc${plural(summary.parksWithEdits, "", "s")}`
                : undefined
          }
          onClick={editsUnavailable ? undefined : () => toggle("edits", true)}
        />
      </div>

      <div className={styles.filterBar}>
        {/* The design-system field wrapper is `width: 100%`: size it from outside. */}
        <div className={styles.search}>
          <Input
            label="Rechercher"
            type="search"
            placeholder="Nom, adresse ou ville…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div className={styles.select}>
          <Select
            label="Statut"
            value={filters.status}
            onChange={(e) => updateParams({ status: e.target.value === "all" ? null : e.target.value }, { resetPage: true })}
          >
            {STATUS_VALUES.map((v) => (
              <option key={v} value={v}>
                {STATUS_LABEL[v]}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.chips} role="group" aria-label="Filtres rapides">
          <Chip active={filters.report} aria-pressed={filters.report} onClick={() => toggle("report", !filters.report)}>
            Signalement ouvert
          </Chip>
          <Chip active={filters.incomplete} aria-pressed={filters.incomplete} onClick={() => toggle("incomplete", !filters.incomplete)}>
            À compléter
          </Chip>
          <Chip
            active={filters.edits}
            aria-pressed={filters.edits}
            disabled={editsUnavailable}
            onClick={() => toggle("edits", !filters.edits)}
          >
            Infos à vérifier
          </Chip>
        </div>
        {active && (
          <button type="button" className={styles.reset} onClick={resetFilters}>
            Réinitialiser
          </button>
        )}
        <span className={styles.count}>
          {active ? `${filtered.length} sur ${summary.total}` : `${summary.total}`} parc{plural(summary.total, "", "s")}
        </span>
      </div>

      {narrow ? (
        filtered.length === 0 ? (
          <div className={panelStyles.neutralCard}>
            <div className={styles.stateBox}>{emptyFiltered}</div>
          </div>
        ) : (
          <ul className={`${panelStyles.neutralCard} ${styles.cardList}`} aria-label="Liste de mes parcs">
            {pageRows.map((row) => (
              <li key={row.park.id} className={styles.card}>
                <button type="button" className={styles.cardMain} onClick={() => openPark(row.park)} aria-label={`Ouvrir la fiche de ${row.park.name}`}>
                  <span className={styles.parkName}>{row.park.name}</span>
                  {parkMeta(row.park) && <span className={styles.parkMeta}>{parkMeta(row.park)}</span>}
                  <StatusCell row={row} />
                  {(row.openReport || row.pendingEdits > 0) && <ToTreat row={row} editsUnavailable={editsUnavailable} />}
                  <CompletenessCell row={row} />
                </button>
                {rowActions(row)}
              </li>
            ))}
          </ul>
        )
      ) : (
        <DataTable
          caption="Liste de mes parcs"
          columns={columns}
          rows={pageRows}
          getRowKey={(row) => row.park.id}
          onRowClick={(row) => openPark(row.park)}
          rowLabel={(row) => `Ouvrir la fiche de ${row.park.name}`}
          sort={{ key: sort.key, order: sort.order }}
          onSortChange={(next) => {
            const encoded = `${next.order === "desc" ? "-" : ""}${next.key}`;
            updateParams({ sort: encoded === DEFAULT_SORT ? null : encoded }, { resetPage: true });
          }}
          empty={emptyFiltered}
        />
      )}

      {pageCount > 1 && (
        <div className={styles.pager}>
          <button type="button" className={styles.pagerBtn} disabled={page <= 1} onClick={() => updateParams({ page: page - 1 <= 1 ? null : String(page - 1) })}>
            Précédent
          </button>
          <span>
            Page {page} / {pageCount} · {COMMUNE_PAGE_SIZE} par page
          </span>
          <button type="button" className={styles.pagerBtn} disabled={page >= pageCount} onClick={() => updateParams({ page: String(page + 1) })}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
