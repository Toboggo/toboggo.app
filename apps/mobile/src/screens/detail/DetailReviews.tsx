import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { flagReview } from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark, useParkReviews } from "../../lib/parksQuery";
import { queryClient } from "../../lib/queryClient";
import { useToastStore } from "../../lib/toast";
import { useFormat } from "../../i18n/useFormat";
import styles from "./DetailReviews.module.css";

function Stars({ value }: { value: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={i < Math.round(value) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--color-accent)" }} aria-hidden>
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      ))}
    </>
  );
}

export default function DetailReviews() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("detail");
  const f = useFormat();
  const { data: park } = usePark(id);
  const { data: reviews = [] } = useParkReviews(id);
  const showToast = useToastStore((s) => s.show);
  if (!park) return null;

  const counts = [5, 4, 3, 2, 1].map((star) => reviews.filter((r) => Math.round(r.stars) === star).length);
  const max = Math.max(1, ...counts);

  async function toggleFlag(reviewId: string, flagged: boolean) {
    if (flagged) return;
    await flagReview(reviewId);
    showToast(t("reviews.flagThanks"));
    void queryClient.invalidateQueries({ queryKey: ["park-reviews", id] });
  }

  return (
    <div className={styles.screen}>
      <DetailHeader title={t("parentsReviews")} />
      <div className={styles.body}>
        <div className={styles.summary}>
          <div className={styles.summaryLeft}>
            <div className={styles.avg}>{f.rating(park.rating)}</div>
            <div className={styles.summaryStars}>
              <Stars value={park.rating} />
            </div>
            <div className={styles.summaryCount}>{t("reviewCount", { count: park.review_count })}</div>
          </div>
          <div className={styles.breakdown}>
            {[5, 4, 3, 2, 1].map((star, i) => (
              <div key={star} className={styles.brow}>
                <span>{star}</span>
                <div className={styles.btrack}>
                  <div style={{ width: `${(counts[i] / max) * 100}%` }} />
                </div>
                <span>{counts[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {reviews.map((r) => (
          <div key={r.id} className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.initial}>{r.author_name.slice(0, 1).toUpperCase()}</div>
              <div className={styles.cardMeta}>
                <div className={styles.cardTop}>
                  <span className={styles.name}>{r.author_name}</span>
                  <span className={styles.date}>{f.date(r.created_at)}</span>
                </div>
                <div className={styles.cardStars}>
                  <Stars value={r.stars} />
                </div>
              </div>
            </div>
            {r.comment && <p className={styles.comment}>{r.comment}</p>}
            <button
              type="button"
              className={styles.flag}
              onClick={() => toggleFlag(r.id, r.flagged)}
              style={{ cursor: r.flagged ? "default" : "pointer" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              {r.flagged ? t("reviews.flagged") : t("reviews.flag")}
            </button>
          </div>
        ))}

        {reviews.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 13, margin: "24px 0" }}>
            {t("reviews.empty")}
          </p>
        )}

        <button type="button" className={styles.write} onClick={() => navigate(`/rate?park=${park.id}`)}>
          {t("reviews.write")}
        </button>
      </div>
    </div>
  );
}
