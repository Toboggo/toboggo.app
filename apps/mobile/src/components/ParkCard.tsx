import { useNavigate } from "react-router-dom";
import { Icon, StarRating } from "@toboggo/design-system";
import { AGE_BAND_LABEL, formatDistance, type Park } from "@toboggo/shared";
import { parkPhotoUrl } from "../lib/photos";
import styles from "./ParkCard.module.css";

function ageLabel(park: Park) {
  if (park.age_min === 0 && park.age_max >= 12) return AGE_BAND_LABEL.all;
  if (park.age_max <= 3) return AGE_BAND_LABEL.under3;
  if (park.age_min >= 6) return AGE_BAND_LABEL["6-12"];
  return AGE_BAND_LABEL["3-6"];
}

export function ParkCard({
  park,
  distanceM,
  favorite,
  onToggleFavorite,
}: {
  park: Park;
  distanceM?: number;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <button className={styles.row} onClick={() => navigate(`/park/${park.id}`)}>
      <div className={styles.thumb} style={{ backgroundImage: `url(${parkPhotoUrl(park, 0, 140, 140)})` }} />
      <div className={styles.body}>
        <div className={styles.name}>{park.name}</div>
        <div className={styles.meta}>
          {distanceM != null ? `${formatDistance(distanceM)} · ` : ""}
          {ageLabel(park)}
        </div>
        <StarRating value={park.rating} count={park.review_count} size="sm" />
      </div>
      {onToggleFavorite && (
        <button
          className={styles.favBtn}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={favorite}
        >
          <Icon
            name="ic-heart"
            size={20}
            style={{ color: favorite ? "var(--color-primary)" : "var(--color-text-faint)" }}
          />
        </button>
      )}
    </button>
  );
}
