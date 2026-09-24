import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, StarRating, type IconName } from "@toboggo/design-system";
import { getParkDisplayName, walkMinutes, type Park } from "@toboggo/shared";
import { ParkPhoto } from "./ParkPhoto";
import { hasRating, keyAttributes } from "../lib/parkDisplay";
import { useFormat } from "../i18n/useFormat";
import styles from "./ParkCard.module.css";

const ATTR_ICON: Record<ReturnType<typeof keyAttributes>[number], IconName> = {
  fenced: "ic-fence",
  shaded: "ic-shade",
  toilets: "ic-toilets",
  accessible: "ic-pmr",
};

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

function FavButton({
  favorite,
  onToggle,
  activeColor = "var(--color-error)",
}: {
  favorite?: boolean;
  onToggle: () => void;
  /** Fill colour of the active heart — the Explore carousel uses the brand green. */
  activeColor?: string;
}) {
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
      {/* Inline (not the shared <Icon> sprite, whose ic-heart symbol is
          hardcoded fill="none") so the active state is a solid filled heart,
          not just a colored outline — matches ParkDetail's favorite button. */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={favorite ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        style={{ color: favorite ? activeColor : "var(--color-text-faint)" }}
        aria-hidden
      >
        <path d="M12 21s-7.5-4.6-10-9.3C.5 7.8 2.7 4 6.5 4c2 0 3.5 1.2 5.5 3.3C14 5.2 15.5 4 17.5 4c3.8 0 6 3.8 4.5 7.7C19.5 16.4 12 21 12 21z" />
      </svg>
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
   * `carousel` — vertical, photo-first (Explore's "Autour de vous" strip).
   */
  variant?: "row" | "list" | "carousel";
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("features");
  const f = useFormat();
  const displayName = getParkDisplayName(park, t);
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
    // Photo-first, only real data, in this order: age (on the photo) and
    // favourite, then name, rating + review count (only when reviews back it),
    // distance · walking time, then at most two known attributes.
    const attrs = keyAttributes(park);
    return (
      <div className={styles.card} {...activate}>
        <div className={styles.media}>
          <ParkPhoto park={park} className={styles.cardPhoto} markSize={40} />
          {ageBand && <span className={styles.ageTag}>{ageBand}</span>}
          {onToggleFavorite && (
            <span className={styles.favFloat}>
              <FavButton favorite={favorite} onToggle={onToggleFavorite} activeColor="var(--color-primary)" />
            </span>
          )}
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardName}>{displayName}</div>
          <CompactRating park={park} />
          {(walkDistance || attrs.length > 0) && (
            <div className={styles.cardMeta}>
              {walkDistance && <span className={styles.cardDist}>{walkDistance}</span>}
              {/* Known attributes as discreet pictograms on the same line —
                  keeps the card short enough for the medium snap; the label
                  stays available to screen readers and on hover. */}
              {attrs.map((a) => {
                const label = t(`attr.${a}`);
                return (
                  <span key={a} className={styles.fact} role="img" aria-label={label} title={label}>
                    <Icon name={ATTR_ICON[a]} size={14} />
                  </span>
                );
              })}
            </div>
          )}
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
            <div className={styles.name}>{displayName}</div>
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
        <div className={styles.name}>{displayName}</div>
        <div className={styles.meta}>
          {distanceM != null ? f.distance(distanceM) : ""}
          {distanceM != null && ageBand ? " · " : ""}
          {ageBand ?? ""}
        </div>
        {hasRating(park) && (
          <StarRating value={park.rating} valueText={f.rating(park.rating)} count={park.review_count} size="sm" />
        )}
      </div>
      {onToggleFavorite && <FavButton favorite={favorite} onToggle={onToggleFavorite} />}
    </div>
  );
}
