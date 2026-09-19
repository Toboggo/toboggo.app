import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, DataTable, type DataTableColumn } from "@toboggo/design-system";
import { listParkEditsWithDetails, type ParkEditWithDetails } from "@toboggo/shared";
import { ParkEditStatusTag } from "../../components/StatusTag";
import { parkEditTypeLabel } from "../../lib/parkEditType";
import styles from "../ParkDetail.module.css";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Lecture seule : ouvre `/validation/:editId`, le seul endroit où
 * Accepter/Refuser existe (RPC sécurisée `review_park_edit`, migration 0037).
 * Aucune action de décision n'est dupliquée ici.
 */
export function ParkEditsPanel({ parkId, parkName }: { parkId: string; parkName: string }) {
  const navigate = useNavigate();

  const { data: edits = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["park-edits-details", parkId],
    queryFn: () => listParkEditsWithDetails({ parkId }),
  });

  const columns: DataTableColumn<ParkEditWithDetails>[] = [
    { key: "type", header: "Champs concernés", render: (e) => parkEditTypeLabel(e.changes) },
    { key: "proposed_by", header: "Proposé par", render: (e) => e.proposedByName ?? "Utilisateur" },
    {
      key: "created_at",
      header: "Date",
      width: "1px",
      align: "right",
      render: (e) => <span className={styles.date}>{dateFmt.format(new Date(e.created_at))}</span>,
    },
    { key: "status", header: "Statut", width: "1px", render: (e) => <ParkEditStatusTag status={e.status} /> },
    { key: "action", header: "", width: "1px", align: "right", render: () => <span className={styles.viewAffordance}>Voir</span> },
  ];

  return (
    <div className={styles.panel}>
      <DataTable
        caption={`Modifications proposées — ${parkName}`}
        columns={columns}
        rows={edits}
        getRowKey={(e) => e.id}
        onRowClick={(e) => navigate(`/validation/${e.id}`)}
        rowLabel={(e) => `Ouvrir la proposition — ${parkEditTypeLabel(e.changes)}`}
        state={isError ? "error" : isLoading ? "loading" : "ready"}
        loadingRows={3}
        error={
          <>
            <p>Impossible de charger les modifications proposées.</p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              Réessayer
            </Button>
          </>
        }
        empty={<p>Aucune modification proposée pour ce parc.</p>}
      />
    </div>
  );
}
