import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState } from "@toboggo/design-system";
import { haversineMeters, listParksByIds } from "@toboggo/shared";
import { BottomTabs } from "../../components/BottomTabs";
import { ParkCard } from "../../components/ParkCard";
import { useSession } from "../../lib/session";
import { useGeo } from "../../lib/geo";
import styles from "./Favorites.module.css";

export default function Favorites() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const { t: tCommon } = useTranslation("common");
  const { t: tErr } = useTranslation("errors");
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const toggleFavoriteAction = useSession((s) => s.toggleFavorite);
  // Passive read only — never triggers a permission prompt from this screen;
  // `hasFix` is true only once a real position (GPS or a picked city) exists.
  const { lat, lng, hasFix } = useGeo();
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const {
    data: parks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["favorite-parks", favorites],
    queryFn: () => listParksByIds(favorites),
  });

  const hasItems = parks.length > 0;

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerIdentity}>
            <img className={styles.headerIcon} src="/profile/icon-favorite.svg" alt="" aria-hidden="true" />
            <div className={styles.headerText}>
              <h1 className={styles.headerTitle}>{t("favorites.headerTitle")}</h1>
              {favorites.length > 0 && (
                <p className={styles.headerCount}>{t("favorites.count", { count: favorites.length })}</p>
              )}
            </div>
          </div>
          {hasItems && (
            <button type="button" className={styles.compareBtn} onClick={() => setCompareMode((c) => !c)}>
              {compareMode ? tCommon("action.cancel") : t("favorites.compare")}
            </button>
          )}
        </div>
        <p className={styles.headerSubtitle}>{t("favorites.headerSubtitle")}</p>
      </header>

      {/* Lot 2 : rangée de filtres/chips (À proximité, Récents, …) viendra ici. */}

      <div className={styles.body}>
        {isLoading && (
          <div className={styles.skeletonList} aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow} />
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <>
            <EmptyState icon="⚠️" title={tErr("generic")} />
            <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => refetch()}>
              {tCommon("action.retry")}
            </Button>
          </>
        )}

        {!isLoading && !isError && !hasItems && (
          <>
            <EmptyState iconName="ic-heart" title={t("favorites.emptyTitle")} description={t("favorites.emptyDesc")} />
            <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => navigate("/map")}>
              {tCommon("nav.explore")}
            </Button>
          </>
        )}

        {!isLoading && !isError && hasItems && (
          <div className={styles.list}>
            {parks.map((park) =>
              compareMode ? (
                <label key={park.id} className={styles.compareRow}>
                  <input
                    type="checkbox"
                    checked={selected.has(park.id)}
                    onChange={() => toggleSelect(park.id)}
                    aria-label={park.name}
                  />
                  <div className={styles.compareCard}>
                    <ParkCard park={park} location={park.city} />
                  </div>
                </label>
              ) : (
                <ParkCard
                  key={park.id}
                  park={park}
                  variant="favorite"
                  location={park.city}
                  distanceM={hasFix ? haversineMeters(lat, lng, park.lat, park.lng) : undefined}
                  favorite
                  onToggleFavorite={() => toggleFavoriteAction(park.id)}
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* Lot 2/3 : CTA découverte ("Explorer") + section conseils viendront ici. */}

      {compareMode && selected.size >= 2 && (
        <div className={styles.compareFloat}>
          <Button onClick={() => navigate(`/compare?ids=${Array.from(selected).join(",")}`)}>
            {t("favorites.compareCount", { count: selected.size })}
          </Button>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}
