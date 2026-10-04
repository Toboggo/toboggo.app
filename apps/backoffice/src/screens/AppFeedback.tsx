import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DataTable, StarRating, StatCard, Tag, type DataTableColumn } from "@toboggo/design-system";
import { getAppFeedbackSummary, listAppFeedback, type AppFeedback as AppFeedbackRow } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const numFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

interface Row extends AppFeedbackRow {
  /** Dernier avis de son auteur (seul compté dans la note globale). */
  isLatest: boolean;
}

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "rating", header: "Note", width: "1px", render: (r) => <StarRating value={r.rating} size="sm" showValue={false} /> },
  {
    key: "body",
    header: "Avis",
    render: (r) => (
      <>
        {r.title && <strong>{r.title}</strong>}
        {r.body && <span style={{ display: "block", whiteSpace: "pre-wrap" }}>{r.body}</span>}
        {!r.title && !r.body && <em>Sans commentaire</em>}
      </>
    ),
  },
  { key: "user", header: "Utilisateur", width: "1px", render: (r) => <code>{r.user_id.slice(0, 8)}</code> },
  {
    key: "date",
    header: "Date",
    width: "1px",
    render: (r) => (
      <>
        {dateFmt.format(new Date(r.created_at))}
        {r.edited_at && <span style={{ display: "block", opacity: 0.7 }}>modifié le {dateFmt.format(new Date(r.edited_at))}</span>}
      </>
    ),
  },
  {
    key: "status",
    header: "Statut",
    width: "1px",
    render: (r) => (r.isLatest ? <Tag tone="primary">Dernier avis</Tag> : <Tag>Historique</Tag>),
  },
];

/**
 * Évaluations de l'app Toboggo (table `app_feedback`, 0039 + historique 0044).
 * Réservé aux admins Toboggo : la RLS ne renvoie rien à un membre de
 * collectivité, et la route redirige de toute façon. La note globale ne compte
 * que le DERNIER avis de chaque utilisateur ; l'historique reste consultable.
 */
export default function AppFeedback() {
  const { isAdmin } = useOrgScope();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["bo-app-feedback"],
    queryFn: listAppFeedback,
    enabled: isAdmin,
  });
  const summary = useQuery({
    queryKey: ["bo-app-feedback-summary"],
    queryFn: getAppFeedbackSummary,
    enabled: isAdmin,
  });

  // `data` is newest-first: the first row seen for a user is their latest.
  const rows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    return data.map((r) => {
      const isLatest = !seen.has(r.user_id);
      seen.add(r.user_id);
      return { ...r, isLatest };
    });
  }, [data]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const s = summary.data;
  const count = s?.rating_count ?? 0;

  return (
    <div>
      <PageHeader title="Évaluations de l'app" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard
          icon="ic-star"
          tone="accent"
          value={summary.isError ? "—" : count > 0 && s?.average_rating != null ? numFmt.format(s.average_rating) : "—"}
          label="Note moyenne"
          hint="Dernier avis de chaque utilisateur"
        />
        <StatCard value={summary.isError ? "—" : count} label="Utilisateurs ayant évalué" />
        <StatCard
          value={summary.isError ? "—" : s?.total_submissions ?? 0}
          label="Avis au total"
          hint="Historique inclus"
        />
      </div>
      <DataTable
        caption="Évaluations de l'app Toboggo"
        columns={COLUMNS}
        rows={rows}
        getRowKey={(r) => r.id}
        state={isLoading ? "loading" : isError ? "error" : "ready"}
        empty="Aucune évaluation pour le moment."
        error="Impossible de charger les évaluations."
      />
    </div>
  );
}
