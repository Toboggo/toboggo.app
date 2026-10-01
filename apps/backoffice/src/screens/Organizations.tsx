import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, DataTable, Input, Select, Tag, type DataTableColumn } from "@toboggo/design-system";
import { listOrganizationsWithCounts, type OrganizationType, type OrganizationWithCounts } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import styles from "./Organizations.module.css";

const ORG_TYPE_LABEL: Record<OrganizationType, string> = {
  municipality: "Commune",
  intercommunality: "Intercommunalité",
  department: "Département",
  region: "Région",
  state: "État",
  private_operator: "Opérateur privé",
  association: "Association",
  other: "Autre",
};

type VerifiedFilter = "all" | "verified" | "unverified";
const VERIFIED_VALUES: VerifiedFilter[] = ["all", "verified", "unverified"];
const VERIFIED_LABEL: Record<VerifiedFilter, string> = {
  all: "Toutes",
  verified: "Vérifiée",
  unverified: "Non vérifiée",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Liste Admin des collectivités (Admin-UI-3B). Lecture seule pour ce lot —
 * le chevron/la ligne pointent vers `/organizations/:id`, une route pas
 * encore construite (Admin-UI-3C) : cliquer redirige provisoirement vers le
 * tableau de bord via le catch-all de `App.tsx`, assumé pour ce lot.
 */
export default function Organizations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const verified = (searchParams.get("verified") as VerifiedFilter | null) ?? "all";
  const q = searchParams.get("q")?.trim() ?? "";
  const hasActiveFilters = q !== "" || verified !== "all";

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
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["bo-organizations"],
    queryFn: () => listOrganizationsWithCounts(),
  });
  const all = data ?? [];

  const filtered = all
    .filter((o) => verified === "all" || (verified === "verified" ? o.verified : !o.verified))
    .filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));

  function openOrg(org: OrganizationWithCounts) {
    navigate(`/organizations/${org.id}`);
  }

  const columns: DataTableColumn<OrganizationWithCounts>[] = [
    {
      key: "name",
      header: "Collectivité",
      render: (o) => (
        <>
          <span className={styles.name}>{o.name}</span>
          <span className={styles.type}>{ORG_TYPE_LABEL[o.type] ?? o.type}</span>
        </>
      ),
    },
    {
      key: "parks",
      header: "Parcs rattachés",
      width: "1px",
      align: "right",
      render: (o) => o.parkCount,
    },
    {
      key: "verified",
      header: "Vérification",
      width: "1px",
      render: (o) => <Tag tone={o.verified ? "primary" : "neutral"}>{o.verified ? "Vérifiée" : "Non vérifiée"}</Tag>,
    },
    {
      key: "created_at",
      header: "Créée le",
      width: "1px",
      align: "right",
      render: (o) => <span className={styles.date}>{dateFmt.format(new Date(o.created_at))}</span>,
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
        title="Collectivités"
        subtitle="Gestion globale des collectivités partenaires Toboggo."
        actions={
          !isLoading && !isError ? (
            <Tag tone="neutral">
              {all.length} collectivité{all.length > 1 ? "s" : ""}
            </Tag>
          ) : undefined
        }
      />

      <div className={styles.filterBar}>
        <Input
          className={styles.search}
          label="Rechercher"
          type="search"
          placeholder="Nom de la collectivité…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <Select
          className={styles.select}
          label="Vérification"
          value={verified}
          onChange={(e) => updateParams({ verified: e.target.value === "all" ? null : e.target.value })}
        >
          {VERIFIED_VALUES.map((v) => (
            <option key={v} value={v}>
              {VERIFIED_LABEL[v]}
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
            {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <DataTable
        caption="Liste des collectivités partenaires"
        columns={columns}
        rows={filtered}
        getRowKey={(o) => o.id}
        onRowClick={openOrg}
        rowLabel={(o) => `Ouvrir la collectivité — ${o.name}`}
        state={isError ? "error" : isLoading ? "loading" : "ready"}
        loadingRows={5}
        error={
          <>
            <p>Impossible de charger les collectivités.</p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              Réessayer
            </Button>
          </>
        }
        empty={
          hasActiveFilters ? (
            <>
              <p>Aucune collectivité ne correspond à ces critères.</p>
              <Button size="sm" variant="secondary" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            </>
          ) : (
            <p>Aucune collectivité enregistrée.</p>
          )
        }
      />
    </div>
  );
}
