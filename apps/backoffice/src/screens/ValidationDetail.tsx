import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@toboggo/design-system";
import { getParkEditWithDetails } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkEditStatusTag } from "../components/StatusTag";
import { parkEditItems, formatItemValue } from "../lib/parkEditType";
import styles from "./ValidationDetail.module.css";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/**
 * Détail READ-ONLY d'une proposition (Admin-3B-1). Affiche la proposition
 * telle que soumise — pas de relecture live du parc, pas de classification
 * APPLICABLE/CONFLICT/ALREADY_APPLIED (qui exige de relire l'état réel du
 * parc et de reproduire la logique de `review_park_edit`), pas d'action
 * Approuver/Rejeter. Cette comparaison A/B/C + les actions sont Admin-3B-2 —
 * volontairement pas dupliquées ici pour ne pas construire un écran jetable.
 */
export default function ValidationDetail() {
  const { editId = "" } = useParams();
  const navigate = useNavigate();

  const { data: edit, isLoading, isError, refetch } = useQuery({
    queryKey: ["park-edit", editId],
    queryFn: () => getParkEditWithDetails(editId),
    enabled: !!editId,
  });

  function goBack() {
    navigate("/validation");
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Proposition" />
        <p className={styles.stateBox}>Chargement…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="Proposition" />
        <p className={styles.stateBox}>Impossible de charger cette proposition.</p>
        <div style={{ textAlign: "center" }}>
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (!edit) {
    return (
      <div>
        <PageHeader title="Proposition introuvable" />
        <p className={styles.stateBox}>Cette proposition n'existe pas ou n'est pas accessible avec votre compte.</p>
        <div style={{ textAlign: "center" }}>
          <Button variant="secondary" size="sm" onClick={goBack}>
            Retour à la file
          </Button>
        </div>
      </div>
    );
  }

  const items = parkEditItems(edit.changes);
  const note =
    typeof edit.changes === "object" && edit.changes !== null && !Array.isArray(edit.changes)
      ? edit.changes.note
      : undefined;

  return (
    <div>
      <nav className={styles.breadcrumb} aria-label="Fil d'Ariane">
        <a
          href="/validation"
          onClick={(e) => {
            e.preventDefault();
            goBack();
          }}
        >
          File de validation
        </a>
        <span className={styles.crumbSep} aria-hidden="true">
          ›
        </span>
        <span className={styles.crumbCurrent}>{edit.parks?.name ?? "Proposition"}</span>
      </nav>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{edit.parks?.name ?? "Parc non renseigné"}</h1>
          <div className={styles.tags}>
            <ParkEditStatusTag status={edit.status} />
          </div>
          {edit.park_id && (
            <div style={{ marginTop: 8 }}>
              <a className={styles.parkLink} href={`/parks/${edit.park_id}`}>
                Ouvrir la fiche du parc
              </a>
            </div>
          )}
        </div>
      </div>

      <div className={styles.meta}>
        <div>
          <span className={styles.metaLabel}>Proposé par :</span>
          {edit.proposedByName ?? "Utilisateur"}
        </div>
        <div>
          <span className={styles.metaLabel}>Le :</span>
          {dateTimeFmt.format(new Date(edit.created_at))}
        </div>
        {typeof note === "string" && note.trim() !== "" && (
          <div>
            <span className={styles.metaLabel}>Note :</span>
            {note}
          </div>
        )}
        {edit.status !== "pending" && edit.reviewed_at && (
          <div>
            <span className={styles.metaLabel}>Traitée le :</span>
            {dateTimeFmt.format(new Date(edit.reviewed_at))}
          </div>
        )}
        {edit.status !== "pending" && edit.review_note && (
          <div>
            <span className={styles.metaLabel}>Note de traitement :</span>
            {edit.review_note}
          </div>
        )}
      </div>

      <p className={styles.futureNote}>
        Comparaison en direct avec l'état réel du parc et actions d'approbation/rejet : à venir dans un prochain lot.
        Les valeurs ci-dessous sont celles proposées au moment de la soumission.
      </p>

      <div>
        <div className={styles.itemsTitle}>Modifications proposées</div>
        {items.length === 0 ? (
          <p className={styles.stateBox}>Aucun détail exploitable pour cette proposition.</p>
        ) : (
          items.map((item, i) => (
            <div key={`${item.field}-${i}`} className={styles.item}>
              <div className={styles.itemLabel}>{item.label}</div>
              <div className={styles.itemDiff}>
                <span className={styles.itemCurrent}>{formatItemValue(item.current)}</span>
                <span className={styles.itemArrow} aria-hidden="true">
                  →
                </span>
                <span className={styles.itemProposed}>{formatItemValue(item.proposed)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
