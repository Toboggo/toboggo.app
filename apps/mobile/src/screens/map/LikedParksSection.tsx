import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { haversineMeters, listParksByIds } from "@toboggo/shared";
import { ParkCarousel } from "./ParkCarousel";
import styles from "./MapExplore.module.css";

/**
 * "Les parcs que vous avez aimés" — surfaces the user's own favorites inside
 * the intermediate Explore sheet, next to (not instead of) "Autour de vous".
 * Reuses the exact same favorites query key as the Favorites screen
 * (`listParksByIds`) so switching between the two never refetches, and the
 * same `ParkCarousel` card so the heart stays the one true indicator.
 */
export function LikedParksSection({
  favoriteIds,
  lat,
  lng,
  onToggleFavorite,
  onSelect,
}: {
  favoriteIds: string[];
  lat: number;
  lng: number;
  onToggleFavorite: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation("map");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const { data: likedParks = [] } = useQuery({
    queryKey: ["favorite-parks", favoriteIds],
    queryFn: () => listParksByIds(favoriteIds),
    enabled: favoriteIds.length > 0,
  });

  const withDistance = useMemo(
    () =>
      [...likedParks]
        .map((p) => ({ ...p, distance_m: haversineMeters(lat, lng, p.latitude, p.longitude) }))
        .sort((a, b) => a.distance_m - b.distance_m),
    [likedParks, lat, lng],
  );

  if (favoriteIds.length === 0 || withDistance.length === 0) return null;

  return (
    <div className={styles.intermediate}>
      <div className={styles.sheetHead}>
        <div className={styles.sheetTitle}>{t("sheet.likedParks")}</div>
        <button type="button" className={styles.seeAll} onClick={() => navigate("/favorites")}>
          {tc("action.seeAll")}
        </button>
      </div>
      <ParkCarousel
        parks={withDistance}
        favorites={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        onSelect={onSelect}
      />
    </div>
  );
}
