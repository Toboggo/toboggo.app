import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Textarea, useConfirm, useToast } from "@toboggo/design-system";
import { getParkEditWithDetails, getPark, reviewParkEdit, type ParkEditReviewResult } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkEditStatusTag, ParkEditItemResultTag } from "../components/StatusTag";
import { parkEditItems, formatItemValue } from "../lib/parkEditType";
import { previewParkEditItem } from "../lib/parkEditReviewPreview";
import { usePermissions } from "../lib/permissions";
import { useAsyncAction } from "../lib/useAsyncAction";
import { queryClient } from "../lib/queryClient";
import styles from "./ValidationDetail.module.css";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/**
 * Détail d'une proposition (Admin-3B-2). Pour une proposition `pending` :
 * comparaison A (soumis) / B (réel, relu en direct via `getPark`) / C
 * (proposé) par item, avec conflit explicite quand B a divergé de A, puis
 * actions Approuver/Rejeter — exclusivement via la RPC `review_park_edit`
 * (migration 0037), qui reclasse elle-même en direct dans sa transaction
 * verrouillée et applique réellement les champs sans conflit. La
 * classification affichée ici (`lib/parkEditReviewPreview.ts`) est un
 * APERÇU lecture seule : elle n'écrit rien, seule la RPC décide et écrit.
 * Une proposition déjà traitée reste un simple rappel historique (pas de
 * reclassification a posteriori, qui serait trompeuse — voir §Historique).
 */
export default function ValidationDetail() {
  const { editId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { canReviewParkEdit } = usePermissions();
  const [note, setNote] = useState("");

  useEffect(() => setNote(""), [editId]);

  const { data: edit, isLoading, isError, refetch } = useQuery({
    queryKey: ["park-edit", editId],
    queryFn: () => getParkEditWithDetails(editId),
    enabled: !!editId,
  });

  const isPending = edit?.status === "pending";
  const parkId = edit?.park_id ?? null;

  // Relecture EN DIRECT du parc — seulement utile tant que la proposition est
  // encore en attente (une proposition déjà traitée n'a plus de décision à
  // prévisualiser).
  const {
    data: park,
    isLoading: isParkLoading,
    isError: isParkError,
    refetch: refetchPark,
  } = useQuery({
    queryKey: ["park-edit-live-park", parkId],
    queryFn: () => getPark(parkId!),
    enabled: !!parkId && isPending,
  });

  function invalidateAfterDecision() {
    void queryClient.invalidateQueries({ queryKey: ["park-edit", editId] });
    void queryClient.invalidateQueries({ queryKey: ["bo-park-edits"] });
    void queryClient.invalidateQueries({ queryKey: ["shell-pending-edits"] });
  }

  function handleResult(result: ParkEditReviewResult) {
    invalidateAfterDecision();
    if (result.outcome === "approved") {
      const appliedCount = result.items.filter((i) => i.applied).length;
      toast.success(
        appliedCount > 0
          ? `Proposition approuvée — ${appliedCount} champ${appliedCount > 1 ? "s" : ""} appliqué${appliedCount > 1 ? "s" : ""} au parc.`
          : "Proposition approuvée.",
      );
    } else if (result.outcome === "requires_manual_review") {
      toast.info(
        "Aucun champ n'a pu être appliqué automatiquement (conflit ou vérification manuelle) — la proposition reste en attente.",
      );
    } else if (result.outcome === "rejected") {
      toast.success("Proposition rejetée.");
    } else {
      toast.info("Cette proposition avait déjà été traitée entre-temps.");
    }
    setNote("");
  }

  const { run: runApprove, pending: approving } = useAsyncAction(async () => {
    if (!edit) return;
    handleResult(await reviewParkEdit(edit.id, "approve", note.trim() || undefined));
  });

  const { run: runReject, pending: rejecting } = useAsyncAction(async () => {
    if (!edit) return;
    handleResult(await reviewParkEdit(edit.id, "reject", note.trim() || undefined));
  });

  async function onApprove() {
    const ok = await confirm({
      title: "Approuver la proposition",
      message: "Les champs sans conflit seront appliqués immédiatement au parc. Cette décision est définitive.",
      confirmLabel: "Confirmer l'approbation",
    });
    if (ok) await runApprove();
  }

  async function onReject() {
    const ok = await confirm({
      title: "Rejeter la proposition",
      message: "Aucune modification ne sera appliquée au parc. Cette décision est définitive.",
      confirmLabel: "Confirmer le rejet",
      danger: true,
    });
    if (ok) await runReject();
  }

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
  const note_ =
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
        {typeof note_ === "string" && note_.trim() !== "" && (
          <div>
            <span className={styles.metaLabel}>Note :</span>
            {note_}
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

      {!isPending && (
        <p className={styles.futureNote}>
          Cette proposition a déjà été traitée. Les valeurs ci-dessous sont celles soumises au départ — elles ne
          reflètent pas nécessairement l'état actuel du parc.
        </p>
      )}

      {isPending && !parkId && (
        <p className={styles.conflictBanner}>
          Cette proposition n'est rattachée à aucun parc : elle ne peut pas être traitée automatiquement.
        </p>
      )}

      {isPending && parkId && isParkError && (
        <p className={styles.conflictBanner}>
          Impossible de vérifier l'état actuel du parc.{" "}
          <button type="button" className={styles.inlineRetry} onClick={() => void refetchPark()}>
            Réessayer
          </button>
        </p>
      )}

      <div>
        <div className={styles.itemsTitle}>Modifications proposées</div>
        {items.length === 0 ? (
          <p className={styles.stateBox}>Aucun détail exploitable pour cette proposition.</p>
        ) : (
          items.map((item, i) => {
            const preview = isPending && park ? previewParkEditItem(item, park) : undefined;
            return (
              <div key={`${item.field}-${i}`} className={styles.item}>
                <div className={styles.itemLabelRow}>
                  <span className={styles.itemLabel}>{item.label}</span>
                  {preview && <ParkEditItemResultTag result={preview.result} />}
                  {isPending && parkId && !park && !isParkError && (
                    <span className={styles.itemChecking}>Vérification…</span>
                  )}
                </div>
                <div className={styles.itemDiff}>
                  <span className={styles.itemCurrent}>{formatItemValue(item.current)}</span>
                  <span className={styles.itemArrow} aria-hidden="true">
                    →
                  </span>
                  <span className={styles.itemProposed}>{formatItemValue(item.proposed)}</span>
                </div>
                {preview && preview.live !== undefined && (
                  <div className={styles.itemLive}>Valeur actuelle réelle du parc : {formatItemValue(preview.live)}</div>
                )}
                {preview?.result === "CONFLICT" && (
                  <div className={styles.conflictNote}>
                    ⚠ Le parc a changé depuis la soumission — ce champ ne sera pas appliqué automatiquement.
                  </div>
                )}
                {preview?.result === "NOT_AUTOMATICALLY_APPLICABLE" && (
                  <div className={styles.manualNote}>Ce champ nécessite une vérification manuelle, hors parc.</div>
                )}
              </div>
            );
          })
        )}
      </div>

      {isPending && canReviewParkEdit && parkId && !isParkError && (
        <div className={styles.actions}>
          <Textarea label="Note (optionnelle)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className={styles.actionButtons}>
            <Button disabled={rejecting} loading={approving} onClick={onApprove}>
              Approuver
            </Button>
            <Button variant="danger" disabled={approving} loading={rejecting} onClick={onReject}>
              Rejeter
            </Button>
          </div>
        </div>
      )}

      {isPending && !canReviewParkEdit && (
        <p className={styles.stateBox}>Vous n'avez pas les droits pour traiter cette proposition.</p>
      )}
    </div>
  );
}
