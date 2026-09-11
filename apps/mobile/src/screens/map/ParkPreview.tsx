import type { KeyboardEvent, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import { getParkDisplayName, walkMinutes, type Park } from "@toboggo/shared";
import { ParkPhoto } from "../../components/ParkPhoto";
import { useSession } from "../../lib/session";
import { hasRating } from "../../lib/parkDisplay";
import { useFormat } from "../../i18n/useFormat";
import styles from "./ParkPreview.module.css";

const stop = (e: MouseEvent) => e.stopPropagation();

export function ParkPreview({
  park,
  distanceM,
  onToggleFavorite,
  onBack,
}: {
  park: Park & { distance_m?: number };
  distanceM?: number;
  onToggleFavorite: () => void;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("detail");
  const { t: tf } = useTranslation("features");
  const f = useFormat();
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const isFav = favorites.includes(park.id);
  const dist = distanceM ?? park.distance_m ?? 0;
  const openDetail = () => navigate(`/park/${park.id}`);
  const displayName = getParkDisplayName(park, t);

  const ageRangeLabel = f.ageRangeOrNull(park.age_min, park.age_max);
  const criteria: string[] = [];
  if (ageRangeLabel) criteria.push(ageRangeLabel);
  if (park.fenced) criteria.push(tf("attr.fenced"));
  if (park.shade) criteria.push(tf("attr.shaded"));
  if (park.wc) criteria.push(tf("attr.toilets"));

  const gallery = (park.photos ?? []).slice(0, 6);

  return (
    <div className={styles.wrap}>
      {onBack && (
        <button type="button" className={styles.back} onClick={onBack}>
          <Icon name="ic-back" size={13} />
          {t("allParks")}
        </button>
      )}

      <div
        className={styles.headRow}
        role="button"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetail();
          }
        }}
      >
        <ParkPhoto park={park} className={styles.photo} markSize={30} />
        <div className={styles.headBody}>
          <div className={styles.titleRow}>
            <div className={styles.name}>{displayName}</div>
            <div className={styles.circleRow}>
              <button type="button" className={styles.circleBtn} onClick={(e) => { stop(e); navigate(`/park/${park.id}?share=1`); }} aria-label={t("a11y.share")}>
                <Icon name="ic-share" size={15} style={{ color: "var(--color-text)" }} />
              </button>
              <button type="button" className={styles.circleBtn} data-on={isFav ? "1" : undefined} onClick={(e) => { stop(e); onToggleFavorite(); }} aria-label={isFav ? t("a11y.removeFromFavorites") : t("a11y.addToFavorites")}>
                <Icon name="ic-heart" size={15} style={{ color: isFav ? "var(--color-error)" : "var(--color-text)" }} />
              </button>
            </div>
          </div>

          <div className={styles.ratingRow}>
            {hasRating(park) ? (
              <>
                <Icon name="ic-star" size={13} style={{ color: "var(--color-accent)" }} />
                <strong>{f.rating(park.rating)}</strong>
                <span className={styles.reviewsLink} onClick={(e) => { stop(e); navigate(`/park/${park.id}/reviews`); }}>
                  ({t("reviewCount", { count: park.review_count })})
                </span>
              </>
            ) : (
              <span className={styles.reviewsLink} onClick={(e) => { stop(e); navigate(`/park/${park.id}/reviews`); }}>
                {t("noReviewsShort")}
              </span>
            )}
            <span className={styles.walk}>{f.walk(walkMinutes(dist))} · {f.distance(dist)}</span>
          </div>

          {criteria.length > 0 && (
            <div className={styles.chips}>
              {criteria.map((c) => (
                <span key={c} className={styles.chip}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => navigate(`/park/${park.id}/directions`)}>
          <Icon name="ic-route" size={16} style={{ color: "var(--color-on-primary)" }} />
          {t("directions")}
        </button>
        <button type="button" className={styles.secondary} onClick={() => navigate(`/park/${park.id}`)}>
          {t("openDetail")}
        </button>
      </div>

      {park.formatted_address && (
        <>
          <div className={styles.hr} />
          <div className={styles.infoRows}>
            <div className={styles.infoRow}>
              <Icon name="ic-explore" size={16} style={{ color: "var(--color-text-muted)" }} />
              {park.formatted_address}
            </div>
          </div>
        </>
      )}

      {gallery.length > 0 && (
        <div className={styles.section}>
          <div className={styles.kicker}>{t("photos")}</div>
          <div className={styles.photoStrip}>
            {gallery.map((url, i) => (
              <div key={i} className={styles.stripThumb} style={{ backgroundImage: `url(${url})` }} />
            ))}
          </div>
        </div>
      )}

      <button type="button" className={styles.report} onClick={() => navigate(`/report?park=${park.id}`)}>
        <Icon name="ic-flag" size={14} />
        {t("reportProblem")}
      </button>
    </div>
  );
}
