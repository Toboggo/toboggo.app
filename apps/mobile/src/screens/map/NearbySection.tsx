import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import { SUGGESTION_RADIUS_KM, type RadiusKm } from "../../lib/nearbyRadius";
import { ParkCarousel } from "./ParkCarousel";
import { BinocularsIcon, ChevronIcon, CompassIcon, SearchIcon } from "./nearbyIcons";
import type { NearbyContext, NearbySelection } from "./nearbySelection";
import playgroundScene from "../../assets/04-playground-scene.png";
import styles from "./NearbySection.module.css";

/**
 * "Autour de vous" header — the only content at the peek snap, and the top of
 * the medium/expanded content. The count is strictly the active radius.
 */
export function NearbyHeader({
  count,
  radiusKm,
  onOpenZone,
  onExpand,
}: {
  count: number;
  radiusKm: RadiusKm;
  onOpenZone: () => void;
  /** Peek only: raises the sheet one snap (same as tapping the handle). */
  onExpand?: () => void;
}) {
  const { t } = useTranslation("map");
  const f = useFormat();
  const distance = f.distance(radiusKm * 1000);
  return (
    <div className={styles.head}>
      <span className={styles.headIcon}>
        <BinocularsIcon size={20} />
      </span>
      <div className={styles.headText}>
        <div className={styles.title}>{t("nearby.title")}</div>
        <div className={styles.subtitle}>
          {count > 0 ? t("nearby.subtitle", { count, distance }) : t("nearby.subtitleNone", { distance })}
        </div>
      </div>
      <div className={styles.headSide}>
        <button
          type="button"
          className={styles.zonePill}
          onClick={onOpenZone}
          aria-label={t("nearby.zoneAria", { distance })}
          aria-haspopup="dialog"
        >
          {t("nearby.zone", { distance })}
          <ChevronIcon direction="down" size={14} />
        </button>
        {onExpand && (
          <button type="button" className={styles.expandBtn} onClick={onExpand} aria-label={t("nearby.expand")}>
            <ChevronIcon direction="up" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Medium/expanded body under the header: contextual filters + carousel (or,
 * for an empty zone, real suggestions a little further away / the Toboggo
 * empty state). Never changes the radius by itself — only an explicit tap on
 * "Voir des parcs à moins de 10 km" does, through `onSetRadius`.
 */
export function NearbyBody({
  selection,
  contexts,
  onContextChange,
  favorites,
  onToggleFavorite,
  onSelectPark,
  onOpenZone,
  onSetRadius,
}: {
  selection: NearbySelection;
  contexts: NearbyContext[];
  onContextChange: (c: NearbyContext) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelectPark: (id: string) => void;
  onOpenZone: () => void;
  onSetRadius: (r: RadiusKm) => void;
}) {
  const { t } = useTranslation("map");
  const f = useFormat();

  if (selection.activeParks.length === 0) {
    if (selection.suggestions.length > 0) {
      return (
        <div className={styles.body}>
          <div className={styles.sectionTitle}>{t("nearby.furtherTitle")}</div>
          <ParkCarousel
            parks={selection.suggestions}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onSelect={onSelectPark}
          />
          <div className={styles.actionRow}>
            <button type="button" className={styles.primaryBtn} onClick={() => onSetRadius(SUGGESTION_RADIUS_KM)}>
              <SearchIcon size={16} />
              {t("nearby.seeWithin", { distance: f.distance(SUGGESTION_RADIUS_KM * 1000) })}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.empty}>
        {/* Toboggo brand asset (same file as VisitRatingPrompt) — temporary V1
            art until the vector Toboggo illustrations land. */}
        <img className={styles.emptyArt} src={playgroundScene} alt="" loading="lazy" />
        <div className={styles.emptyTitle}>{t("nearby.emptyTitle")}</div>
        <div className={styles.emptyDesc}>{t("nearby.emptyDesc")}</div>
        <button type="button" className={styles.primaryBtn} onClick={onOpenZone}>
          {t("nearby.emptyAction")}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <div className={styles.chips} role="group" aria-label={t("nearby.filtersAria")}>
        {contexts.map((c) => (
          <button
            key={c}
            type="button"
            className={styles.chip}
            data-on={selection.context === c ? "1" : undefined}
            aria-pressed={selection.context === c}
            onClick={() => onContextChange(c)}
          >
            {t(`nearby.filter.${c}`)}
          </button>
        ))}
      </div>

      {selection.carousel.length > 0 ? (
        <ParkCarousel
          parks={selection.carousel}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          onSelect={onSelectPark}
        />
      ) : (
        <div className={styles.contextEmpty}>
          {selection.context === "favorites" ? t("nearby.favoritesEmpty") : t("nearby.childrenEmpty")}
        </div>
      )}

      {selection.hasMoreBeyond && (
        <button type="button" className={styles.more} onClick={onOpenZone}>
          <span className={styles.moreIcon}>
            <CompassIcon size={18} />
          </span>
          <span className={styles.moreText}>
            <span className={styles.moreTitle}>{t("nearby.moreTitle")}</span>
            <span className={styles.moreDesc}>{t("nearby.moreDesc")}</span>
          </span>
          <ChevronIcon direction="right" size={16} className={styles.moreChevron} />
        </button>
      )}
    </div>
  );
}
