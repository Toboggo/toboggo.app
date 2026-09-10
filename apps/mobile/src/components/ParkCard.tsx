import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, StarRating } from "@toboggo/design-system";
import { walkMinutes, type Park } from "@toboggo/shared";
import { ParkPhoto } from "./ParkPhoto";
import { hasRating, keyAttributes } from "../lib/parkDisplay";
import { useFormat } from "../i18n/useFormat";
import styles from "./ParkCard.module.css";

function CompactRating({ park }: { park: Park }) {
  const f = useFormat();
  if (!hasRating(park)) return null;
  return (
    <span className={styles.compactRating}>
      <Icon name="ic-star" size={13} style={{ color: "var(--color-accent)" }} />
      <strong>{f.rating(park.rating)}</strong>
      <span>({f.count(park.review_count)})</span>
    </span>
  );
}

function FavButton({ favorite, onToggle }: { favorite?: boolean; onToggle: () => void }) {
  const { t } = useTranslation("detail");
  return (
    <button
      type="button"
      className={styles.favBtn}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={favorite ? t("a11y.removeFromFavorites") : t("a11y.addToFavorites")}
      aria-pressed={favorite}
    >
      <Icon
        name="ic-heart"
        size={18}
        style={{ color: favorite ? "var(--color-primary)" : "var(--color-text-faint)" }}
      />
    </button>
  );
}

export function ParkCard({
  park,
  distanceM,
  favorite,
  onToggleFavorite,
  onOpen,
  variant = "row",
}: {
  park: Park;
  distanceM?: number;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** Overrides the default "navigate to the park page" tap behaviour. */
  onOpen?: () => void;
  /**
   * `row` — compact horizontal item (favourites, notifications).
   * `list` — richer horizontal item for the Explore results list.
   * `carousel` — vertical, photo-first.
   */
  variant?: "row" | "list" | "carousel";
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("features");
  const f = useFormat();
  const open = () => (onOpen ? onOpen() : navigate(`/park/${park.id}`));
  const ageBand = f.ageBand(park.age_min, park.age_max);
  const walkDistance =
    distanceM != null ? `${f.distance(distanceM)} · ${f.walk(walkMinutes(distanceM))}` : null;
  // Card is a div (not a button) so the favourite <button> can nest legally.
  const activate = {
    role: "button" as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    },
  };

  if (variant === "carousel") {
    return (
      <div className={styles.card} {...activate}>
        <div className={styles.media}>
          <ParkPhoto park={park} className={styles.cardPhoto} markSize={30} />
          {ageBand && <span className={styles.ageTag}>{ageBand}</span>}
          {onToggleFavorite && (
            <span className={styles.favFloat}>
              <FavButton favorite={favorite} onToggle={onToggleFavorite} />
            </span>
          )}
        </div>
        <div className={styles.cardBody}>
          <div className={styles.name}>{park.name}</div>
          <div className={styles.cardMeta}>{walkDistance && <span>{walkDistance}</span>}</div>
          <CompactRating park={park} />
        </div>
      </div>
    );
  }

  if (variant === "list") {
    const attrs = keyAttributes(park);
    const chips = [...(ageBand ? [ageBand] : []), ...attrs.map((a) => t(`attr.${a}`))];
    return (
      <div className={styles.listCard} {...activate}>
        <ParkPhoto park={park} className={styles.listPhoto} markSize={26} />
        <div className={styles.listBody}>
          <div className={styles.listTop}>
            <div className={styles.name}>{park.name}</div>
            {onToggleFavorite && <FavButton favorite={favorite} onToggle={onToggleFavorite} />}
          </div>
          <CompactRating park={park} />
          <div className={styles.listDist}>{walkDistance}</div>
          {chips.length > 0 && (
            <div className={styles.listChips}>
              {chips.map((c) => (
                <span key={c} className={styles.chip}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.row} {...activate}>
      <ParkPhoto park={park} className={styles.thumb} markSize={22} />
      <div className={styles.body}>
        <div className={styles.name}>{park.name}</div>
        <div className={styles.meta}>
          {distanceM != null ? f.distance(distanceM) : ""}
          {distanceM != null && ageBand ? " · " : ""}
          {ageBand ?? ""}
        </div>
        {hasRating(park) && <StarRating value={park.rating} count={park.review_count} size="sm" />}
      </div>
      {onToggleFavorite && <FavButton favorite={favorite} onToggle={onToggleFavorite} />}
    </div>
  );
}
