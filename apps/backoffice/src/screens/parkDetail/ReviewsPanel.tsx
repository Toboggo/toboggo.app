import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, StarRating, useConfirm, useToast } from "@toboggo/design-system";
import { deleteReview, listReviewsForPark, replyToReview } from "@toboggo/shared";
import { ReviewStatusTag } from "../../components/StatusTag";
import { useOrgSession } from "../../lib/orgSession";
import { usePermissions } from "../../lib/permissions";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { queryClient } from "../../lib/queryClient";
import styles from "../ParkDetail.module.css";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export function ReviewsPanel({ parkId }: { parkId: string }) {
  const { canReplyToReview, canDeleteReview } = usePermissions();
  const userName = useOrgSession((s) => s.userName);
  const confirm = useConfirm();
  const toast = useToast();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const { data: reviews = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["park-reviews", parkId],
    queryFn: () => listReviewsForPark(parkId),
  });

  const { run: onDelete, pending: deleting } = useAsyncAction(
    async (id: string) => {
      const ok = await confirm({
        title: "Supprimer cet avis",
        message: "Supprimer définitivement cet avis ? Cette action ne peut pas être annulée.",
        confirmLabel: "Supprimer",
        danger: true,
      });
      if (!ok) return;
      await deleteReview(id);
      void queryClient.invalidateQueries({ queryKey: ["park-reviews", parkId] });
      void queryClient.invalidateQueries({ queryKey: ["bo-reviews"] });
    },
    { successMessage: "Avis supprimé." },
  );

  const { run: onReply, pending: replying } = useAsyncAction(
    async (id: string) => {
      const text = replyDrafts[id];
      if (!text) return;
      await replyToReview(id, text, userName);
      setReplyDrafts((d) => ({ ...d, [id]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["park-reviews", parkId] });
      void queryClient.invalidateQueries({ queryKey: ["bo-reviews"] });
      toast.success("Réponse envoyée.");
    },
    { errorMessage: () => "L'envoi de la réponse a échoué." },
  );

  if (isLoading) return <p className={styles.stateBox}>Chargement des avis…</p>;
  if (isError) {
    return (
      <div className={styles.stateBox}>
        <p>Impossible de charger les avis.</p>
        <Button size="sm" variant="secondary" onClick={() => void refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }
  if (reviews.length === 0) return <p className={styles.stateBox}>Aucun avis pour ce parc.</p>;

  return (
    <div className={styles.panel}>
      <div className={styles.reviewList}>
        {reviews.map((r) => (
          <div key={r.id} className={styles.reviewCard}>
            <div className={styles.reviewHead}>
              <div>
                <strong>{r.author_name}</strong>
                <span className={styles.reviewDate}>{dateFmt.format(new Date(r.created_at))}</span>
              </div>
              <div className={styles.reviewHeadRight}>
                <ReviewStatusTag status={r.status} />
                {canDeleteReview && (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => onDelete(r.id)}
                    className={styles.reviewDeleteBtn}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
            <StarRating value={r.rating} size="sm" />
            {r.comment && <p className={styles.reviewComment}>{r.comment}</p>}

            {r.reply ? (
              <div className={styles.reviewReply}>
                <strong>Réponse :</strong> {r.reply}
              </div>
            ) : canReplyToReview ? (
              <div className={styles.reviewReplyForm}>
                <Input
                  placeholder="Répondre à cet avis…"
                  value={replyDrafts[r.id] ?? ""}
                  onChange={(e) => setReplyDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                />
                <Button size="sm" disabled={replying || !(replyDrafts[r.id] ?? "").trim()} onClick={() => onReply(r.id)}>
                  Répondre
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
