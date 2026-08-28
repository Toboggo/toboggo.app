import { useCallback, useRef } from "react";
import styles from "./RangeSlider.module.css";

export interface DualRangeSliderProps {
  min: number;
  max: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  formatLabel?: (low: number, high: number) => string;
}

/**
 * Dual-handle range slider for the child age filter — explicitly requested by
 * the product owner over a single value or discrete buttons.
 */
export function DualRangeSlider({ min, max, low, high, onChange, formatLabel }: DualRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const pctFor = (v: number) => ((v - min) / (max - min)) * 100;

  const dragHandle = useCallback(
    (which: "low" | "high") => (e: React.PointerEvent) => {
      const track = trackRef.current;
      if (!track) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const raw = Math.round(min + pct * (max - min));
        if (which === "low") {
          onChange(Math.min(raw, high), high);
        } else {
          onChange(low, Math.max(raw, low));
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [min, max, low, high, onChange],
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>{formatLabel ? formatLabel(low, high) : `${low} - ${high} ans`}</div>
      <div className={styles.track} ref={trackRef}>
        <div
          className={styles.fill}
          style={{ left: `${pctFor(low)}%`, width: `${pctFor(high) - pctFor(low)}%` }}
        />
        <div
          className={styles.handle}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={low}
          style={{ left: `${pctFor(low)}%` }}
          onPointerDown={dragHandle("low")}
        />
        <div
          className={styles.handle}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={high}
          style={{ left: `${pctFor(high)}%` }}
          onPointerDown={dragHandle("high")}
        />
      </div>
    </div>
  );
}
