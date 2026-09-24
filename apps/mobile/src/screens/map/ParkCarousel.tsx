import type { Park } from "@toboggo/shared";
import { ParkCard } from "../../components/ParkCard";
import styles from "./ParkCarousel.module.css";

/**
 * Horizontal, scroll-snapping strip of park cards — the primary browsing view
 * in the Explore bottom-sheet's intermediate state. Tapping a card focuses that
 * park on the map (opens its preview) rather than leaving the map context.
 */
export function ParkCarousel({
  parks,
  favorites,
  onToggleFavorite,
  onSelect,
}: {
  parks: (Park & { distance_m: number })[];
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.strip}>
      {parks.map((p) => (
        <ParkCard
          key={p.id}
          park={p}
          distanceM={p.distance_m}
          favorite={favorites.includes(p.id)}
          onToggleFavorite={() => onToggleFavorite(p.id)}
          onOpen={() => onSelect(p.id)}
          variant="carousel"
        />
      ))}
    </div>
  );
}
