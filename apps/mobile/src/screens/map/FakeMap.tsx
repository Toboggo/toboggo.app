import type { Park } from "@toboggo/shared";
import styles from "./FakeMap.module.css";

/**
 * Stylised map backdrop from the Claude Design prototype — grid, a couple of
 * "roads", soft green park blobs, colour-coded score pins and the user dot.
 * Used whenever no real map is configured (VITE_MAP_STYLE_URL unset) — the
 * MapLibre tile layer needs a style URL, this is the offline fallback.
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

function pinColor(rating: number): string {
  const score = rating * 2;
  return score >= 8 ? "#16A34A" : score >= 6 ? "#F08A2E" : "#EF4444";
}

export function FakeMap({
  parks,
  selectedId,
  onSelect,
}: {
  parks: (Park & { distance_m?: number })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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

      <div className={styles.userDot} />

      {parks.map((p) => {
        const { left, top } = hashPos(p.id);
        const active = p.id === selectedId;
        return (
          <button
            key={`pin-${p.id}`}
            type="button"
            className={styles.pin}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              background: pinColor(p.rating),
              outline: active ? "3px solid rgba(22,163,74,0.35)" : "none",
              zIndex: active ? 4 : 2,
            }}
            onClick={() => onSelect(p.id)}
            aria-label={p.name}
          >
            {(p.rating * 2).toFixed(1)}
          </button>
        );
      })}
    </div>
  );
}
