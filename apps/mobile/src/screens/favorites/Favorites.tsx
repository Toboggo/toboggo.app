import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, Icon } from "@toboggo/design-system";
import { haversineMeters, listParksByIds, type Park } from "@toboggo/shared";
import { BottomTabs } from "../../components/BottomTabs";
import { ParkCard } from "../../components/ParkCard";
import { useSession } from "../../lib/session";
import { useGeo, requestBrowserLocation, DEFAULT_GEO_LABEL } from "../../lib/geo";
import { DEFAULT_RADIUS_KM } from "../../lib/nearbyRadius";
import { trackEvent } from "../../lib/analytics";
import styles from "./Favorites.module.css";

type FilterKey = "all" | "nearby";

export default function Favorites() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const { t: tCommon } = useTranslation("common");
  const { t: tErr } = useTranslation("errors");
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const toggleFavoriteAction = useSession((s) => s.toggleFavorite);

  // `favorite_revisited` (EVENT-TAXONOMY.md — "l'utilisateur consulte sa liste
  // de favoris", trigger = montage de Favorites.tsx) — once per mount, not on
  // every re-render triggered by a filter change or a fetch.
  const revisitedTracked = useRef(false);
  useEffect(() => {
    if (revisitedTracked.current) return;
    revisitedTracked.current = true;
    trackEvent("favorite_revisited", { favorites_count: favorites.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Passive read only — never triggers a permission prompt from this screen;
  // `hasFix` is true only once a real position (GPS or a picked city) exists.
  const { lat, lng, hasFix } = useGeo();
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [locating, setLocating] = useState(false);

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

  // Computed once so the "À proximité" filter and each card's displayed
  // distance never run `haversineMeters` twice for the same park.
  const parksWithDistance = useMemo(
    () =>
      parks.map((park) => ({
        park,
        distanceM: hasFix ? haversineMeters(lat, lng, park.lat, park.lng) : undefined,
      })),
    [parks, hasFix, lat, lng],
  );

  // "Nearby" mirrors the map's own default zone (`DEFAULT_RADIUS_KM`, the
  // "Autour de vous" default) rather than inventing a new distance rule.
  // Without a fix, nothing can match — the filter stays selectable and the
  // screen falls through to the regular "no match" empty state instead of
  // hiding or disabling the chip.
  const filteredParks: { park: Park; distanceM: number | undefined }[] =
    filter === "nearby"
      ? parksWithDistance.filter((p) => p.distanceM != null && p.distanceM <= DEFAULT_RADIUS_KM * 1000)
      : parksWithDistance;

  const showResults = hasItems && filteredParks.length > 0;
  // Distinct from a genuine "no match": without a fix we haven't actually
  // determined nothing is nearby, we just don't know where the user is yet.
  const showNeedLocation = hasItems && filter === "nearby" && !hasFix;
  const showFilterEmpty = hasItems && !showNeedLocation && filteredParks.length === 0;

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  // Same pattern as AddPark's `handleUseMyLocation` — a real GPS fix that
  // updates the shared geo store, only ever fired by this explicit tap.
  async function handleUseMyLocation() {
    setLocating(true);
    try {
      const pos = await requestBrowserLocation();
      useGeo.getState().setLocation(pos.lat, pos.lng, DEFAULT_GEO_LABEL);
      useGeo.getState().setPermission("granted");
    } catch {
      useGeo.getState().setPermission("denied");
    } finally {
      setLocating(false);
    }
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

      {hasItems && (
        <div className={styles.filterRow} role="group" aria-label={t("favorites.filters.groupLabel")}>
          <button
            type="button"
            className={styles.filterChip}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            {t("favorites.filters.all", { count: parks.length })}
          </button>
          <button
            type="button"
            className={styles.filterChip}
            aria-pressed={filter === "nearby"}
            onClick={() => setFilter("nearby")}
          >
            {t("favorites.filters.nearby")}
          </button>
        </div>
      )}

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

        {!isLoading && !isError && showNeedLocation && (
          <>
            <EmptyState
              iconName="ic-explore"
              title={t("favorites.filters.nearbyLocationTitle")}
              description={t("favorites.filters.nearbyLocationDesc", { radius: DEFAULT_RADIUS_KM })}
            />
            <Button variant="secondary" block loading={locating} style={{ marginTop: 12 }} onClick={handleUseMyLocation}>
              {t("favorites.tips.location")}
            </Button>
          </>
        )}

        {!isLoading && !isError && showFilterEmpty && (
          <>
            <EmptyState iconName="ic-heart" title={t("favorites.filters.emptyTitle")} />
            <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => setFilter("all")}>
              {t("favorites.filters.emptyReset")}
            </Button>
          </>
        )}

        {!isLoading && !isError && showResults && (
          <div className={styles.list}>
            {filteredParks.map(({ park, distanceM }) =>
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
                  distanceM={distanceM}
                  favorite
                  onToggleFavorite={() => toggleFavoriteAction(park.id)}
                />
              ),
            )}
          </div>
        )}
      </div>

      {!isLoading && !isError && showResults && (
        <>
          <div className={styles.discover}>
            <p className={styles.discoverTitle}>{t("favorites.discover.title")}</p>
            <p className={styles.discoverDesc}>{t("favorites.discover.desc")}</p>
            <Button variant="secondary" block onClick={() => navigate("/map")}>
              {tCommon("nav.explore")}
            </Button>
          </div>

          <div className={styles.tips}>
            <h2 className={styles.tipsTitle}>{t("favorites.tips.title")}</h2>
            {!hasFix && (
              <button type="button" className={styles.tipRow} onClick={handleUseMyLocation} disabled={locating}>
                <Icon name="ic-explore" size={16} />
                <span>{t("favorites.tips.location")}</span>
              </button>
            )}
            <button type="button" className={styles.tipRow} onClick={() => navigate("/rate")}>
              <Icon name="ic-review" size={16} />
              {/* Reuses ParkDetail's own "write a review" copy
                  (`detail:reviews.write`) rather than a near-duplicate string. */}
              <span>{t("reviews.write", { ns: "detail" })}</span>
            </button>
          </div>
        </>
      )}

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
