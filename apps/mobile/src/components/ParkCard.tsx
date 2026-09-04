import { useNavigate } from "react-router-dom";
import { Icon, StarRating } from "@toboggo/design-system";
import { formatAgeRange, formatDistance, type Park } from "@toboggo/shared";
import { ParkPhoto } from "./ParkPhoto";
import styles from "./ParkCard.module.css";

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
      <ParkPhoto park={park} className={styles.thumb} markSize={22} />
      <div className={styles.body}>
        <div className={styles.name}>{park.name}</div>
        <div className={styles.meta}>
          {distanceM != null ? `${formatDistance(distanceM)} · ` : ""}
          {formatAgeRange(park.age_min, park.age_max)}
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
