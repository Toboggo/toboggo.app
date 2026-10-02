import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DataTable, StarRating, type DataTableColumn } from "@toboggo/design-system";
import { listAppFeedback, type AppFeedback as AppFeedbackRow } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

const COLUMNS: DataTableColumn<AppFeedbackRow>[] = [
  { key: "rating", header: "Note", width: "1px", render: (r) => <StarRating value={r.rating} size="sm" showValue={false} /> },
  { key: "title", header: "Titre", render: (r) => <strong>{r.title}</strong> },
  { key: "body", header: "Avis", render: (r) => <span style={{ whiteSpace: "pre-wrap" }}>{r.body}</span> },
  { key: "date", header: "Date", width: "1px", render: (r) => dateFmt.format(new Date(r.created_at)) },
];

/**
 * Évaluations de l'app Toboggo (table `app_feedback`, 0039). Réservé aux
 * admins Toboggo : la RLS ne renvoie rien à un membre de collectivité, et la
 * route redirige de toute façon.
 */
export default function AppFeedback() {
  const { isAdmin } = useOrgScope();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["bo-app-feedback"],
    queryFn: listAppFeedback,
    enabled: isAdmin,
  });

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader title="Évaluations de l'app" />
      <DataTable
        caption="Évaluations de l'app Toboggo"
        columns={COLUMNS}
        rows={data}
        getRowKey={(r) => r.id}
        state={isLoading ? "loading" : isError ? "error" : "ready"}
        empty="Aucune évaluation pour le moment."
        error="Impossible de charger les évaluations."
      />
    </div>
  );
}
