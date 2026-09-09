import type { Park } from "@toboggo/shared";
import { hasRating } from "../../lib/parkDisplay";
import { ratingTierColor } from "./markers";
import styles from "./FakeMap.module.css";

/**
 * Stylised map backdrop — grid, a couple of "roads", soft green park blobs, and
 * Toboggo score pins matching the real MapLibre markers. Used whenever no real
 * map style is configured (VITE_MAP_STYLE_URL unset).
 */

function hashPos(id: string): { left: number; top: number } {
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < id.length; i++) {
    h1 = (h1 ^ id.charCodeAt(i)) * 16777619;
    h2 = (h2 * 33 + id.charCodeAt(i)) >>> 0;
  }
  const left = 14 + ((h1 >>> 0) % 70);
  const top = 20 + ((h2 >>> 0) % 32);
  return { left, top };
}

export function FakeMap({
  parks,
  selectedId,
  onSelect,
  showUser = false,
}: {
  parks: (Park & { distance_m?: number })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showUser?: boolean;
}) {
  return (
    <div className={styles.map}>
      <div className={styles.grid} />
      <div className={styles.roadA} />
      <div className={styles.roadB} />
      <div className={styles.roadC} />

      {parks.map((p) => {
        const { left, top } = hashPos(p.id);
        return <div key={`blob-${p.id}`} className={styles.blob} style={{ left: `calc(${left}% - 30px)`, top: `calc(${top}% - 58px)` }} />;
      })}

      {showUser && <div className={styles.userDot} aria-label="Votre position" />}

      {parks.map((p) => {
        const { left, top } = hashPos(p.id);
        const active = p.id === selectedId;
        const rated = hasRating(p);
        return (
          <button
            key={`pin-${p.id}`}
            type="button"
            className={styles.pin}
            data-selected={active ? "1" : undefined}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              ["--marker-color" as string]: rated ? ratingTierColor(p.rating) : "var(--color-primary)",
            }}
            onClick={() => onSelect(p.id)}
            aria-label={p.name}
          >
            <span className={styles.dot}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 20c3 0 4-2 5-5l7-9M14 4l4 3M9 15l4 1M3 20h4" />
              </svg>
            </span>
            {rated && p.rating.toFixed(1).replace(".", ",")}
          </button>
        );
      })}
    </div>
  );
}
