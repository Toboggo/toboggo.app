import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, DataTable, Input, Select, Tag, type DataTableColumn } from "@toboggo/design-system";
import { listParkEditsWithDetails, type EditStatus, type ParkEditWithDetails } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkEditStatusTag } from "../components/StatusTag";
import { parkEditTypeLabel, type ParkEditTypeLabel } from "../lib/parkEditType";
import styles from "./Validation.module.css";

type TabValue = "pending" | "treated";
const DEFAULT_TAB: TabValue = "pending";

const TREATED_STATUS_VALUES: (EditStatus | "all")[] = ["all", "approved", "rejected", "auto_approved"];
const TREATED_STATUS_LABEL: Record<EditStatus | "all", string> = {
  all: "Tous les statuts",
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Rejetée",
  auto_approved: "Auto-approuvée",
};

const TYPE_VALUES: (ParkEditTypeLabel | "all")[] = [
  "all",
  "Âges",
  "Localisation",
  "Équipements",
  "Plusieurs modifications",
  "Autre",
];
const TYPE_LABEL: Record<ParkEditTypeLabel | "all", string> = {
  all: "Tous les types",
  Âges: "Âges",
  Localisation: "Localisation",
  Équipements: "Équipements",
  "Plusieurs modifications": "Plusieurs modifications",
  Autre: "Autre",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function Validation() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (searchParams.get("tab") as TabValue | null) ?? DEFAULT_TAB;
  const type = (searchParams.get("type") as ParkEditTypeLabel | "all" | null) ?? "all";
  const treatedStatus = (searchParams.get("status") as EditStatus | "all" | null) ?? "all";
  const q = searchParams.get("q")?.trim() ?? "";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";

  const hasActiveFilters = q !== "" || type !== "all" || (tab === "treated" && treatedStatus !== "all");

  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput.trim() !== q) updateParams({ q: qInput.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  function updateParams(next: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    setSearchParams(p, { replace: true });
  }

  function resetFilters() {
    setQInput("");
    const p = new URLSearchParams();
    if (tab !== DEFAULT_TAB) p.set("tab", tab);
    setSearchParams(p, { replace: true });
  }

  // Un seul fetch, toutes les propositions confondues — les onglets/filtres
  // sont dérivés client-side (même approche que Reports : volume attendu
  // faible, pas d'API paginée pour park_edits, pas justifié d'en construire
  // une pour ce lot).
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["bo-park-edits"],
    queryFn: () => listParkEditsWithDetails({}),
  });
  const allEdits = data ?? [];

  const pendingCount = allEdits.filter((e) => e.status === "pending").length;
  const treatedCount = allEdits.filter((e) => e.status !== "pending").length;

  const byTab = allEdits.filter((e) => (tab === "pending" ? e.status === "pending" : e.status !== "pending"));

  const filtered = byTab
    .filter((e) => tab !== "treated" || treatedStatus === "all" || e.status === treatedStatus)
    .filter((e) => type === "all" || parkEditTypeLabel(e.changes) === type)
    .filter((e) => {
      if (!q) return true;
      return (e.parks?.name ?? "").toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return order === "asc" ? diff : -diff;
    });

  function openEdit(edit: ParkEditWithDetails) {
    navigate(`/validation/${edit.id}`);
  }

  const columns: DataTableColumn<ParkEditWithDetails>[] = [
    {
      key: "park",
      header: "Parc",
      render: (e) => (
        <>
          <span className={styles.parkName}>{e.parks?.name ?? "—"}</span>
          <span className={styles.parkMeta}>{e.parks?.formatted_address ?? "Adresse non renseignée"}</span>
        </>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (e) => parkEditTypeLabel(e.changes),
    },
    {
      key: "proposed_by",
      header: "Proposé par",
      render: (e) => e.proposedByName ?? "Utilisateur",
    },
    {
      key: "created_at",
      header: "Date",
      width: "1px",
      align: "right",
      sortable: true,
      render: (e) => <span className={styles.date}>{dateFmt.format(new Date(e.created_at))}</span>,
    },
    {
      key: "status",
      header: "Statut",
      width: "1px",
      render: (e) => <ParkEditStatusTag status={e.status} />,
    },
    {
      key: "action",
      header: "",
      width: "1px",
      align: "right",
      render: () => <span className={styles.viewAffordance}>Voir</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="File de validation"
        subtitle="Vérifiez les corrections proposées avant leur application aux parcs."
        actions={
          !isLoading && !isError ? (
            <Tag tone={pendingCount > 0 ? "accent" : "neutral"}>
              {pendingCount} à traiter
            </Tag>
          ) : undefined
        }
      />

      <div role="tablist" aria-label="Filtrer par statut de traitement" className={styles.filterBar} style={{ marginTop: 0 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pending"}
          className={styles.reset}
          style={{
            color: tab === "pending" ? "var(--color-primary)" : "var(--color-text-muted)",
            fontWeight: tab === "pending" ? 700 : 600,
          }}
          onClick={() => updateParams({ tab: null, status: null })}
        >
          À traiter ({pendingCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "treated"}
          className={styles.reset}
          style={{
            color: tab === "treated" ? "var(--color-primary)" : "var(--color-text-muted)",
            fontWeight: tab === "treated" ? 700 : 600,
          }}
          onClick={() => updateParams({ tab: "treated" })}
        >
          Traitées ({treatedCount})
        </button>
      </div>

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
          label="Type"
          value={type}
          onChange={(e) => updateParams({ type: e.target.value === "all" ? null : e.target.value })}
        >
          {TYPE_VALUES.map((v) => (
            <option key={v} value={v}>
              {TYPE_LABEL[v]}
            </option>
          ))}
        </Select>
        {tab === "treated" && (
          <Select
            className={styles.select}
            label="Statut"
            value={treatedStatus}
            onChange={(e) => updateParams({ status: e.target.value === "all" ? null : e.target.value })}
          >
            {TREATED_STATUS_VALUES.map((v) => (
              <option key={v} value={v}>
                {TREATED_STATUS_LABEL[v]}
              </option>
            ))}
          </Select>
        )}
        {hasActiveFilters && (
          <button type="button" className={styles.reset} onClick={resetFilters}>
            Réinitialiser
          </button>
        )}
        {!isLoading && !isError && (
          <span className={styles.count}>
            {filtered.length} proposition{filtered.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <DataTable
        caption="File de validation des propositions de correction"
        columns={columns}
        rows={filtered}
        getRowKey={(e) => e.id}
        onRowClick={openEdit}
        rowLabel={(e) => `Ouvrir la proposition — ${e.parks?.name ?? "parc non renseigné"}`}
        sort={{ key: "created_at", order }}
        onSortChange={(next) => updateParams({ order: next.order === "desc" ? null : "asc" })}
        state={isError ? "error" : isLoading ? "loading" : "ready"}
        loadingRows={6}
        error={
          <>
            <p>Impossible de charger la file de validation.</p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              Réessayer
            </Button>
          </>
        }
        empty={
          hasActiveFilters ? (
            <>
              <p>Aucune proposition ne correspond à ces critères.</p>
              <Button size="sm" variant="secondary" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            </>
          ) : tab === "pending" ? (
            <p>Aucune proposition à traiter.</p>
          ) : (
            <p>Aucune proposition traitée pour le moment.</p>
          )
        }
      />
    </div>
  );
}
