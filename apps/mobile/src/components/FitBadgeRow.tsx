import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ParkBadge } from "./ParkBadge";
import styles from "./FitBadgeRow.module.css";

export interface FitBadgeItem {
  key: string;
  node: ReactNode;
}

/**
 * One-line badge row for the compact panel. Shows as many badges as fit the
 * available width and summarises the rest as « +N » — never wrapping (a second
 * line would make the bottom sheet taller), never scrolling sideways, never
 * silently dropping anything: N counts exactly the hidden badges. The first
 * `pinned` items (the age) are always shown and are not counted in N.
 *
 * Two-phase layout: the row first renders every badge to measure it (before
 * paint, `useLayoutEffect`), then renders only the ones that fit. It re-measures
 * whenever the row's width or the badges change.
 */
export function FitBadgeRow({ items, pinned = 0 }: { items: FitBadgeItem[]; pinned?: number }) {
  const { t } = useTranslation("features");
  const rowRef = useRef<HTMLDivElement>(null);
  const lastWidth = useRef(0);
  const [fit, setFit] = useState<number | null>(null);
  const signature = items.map((i) => i.key).join("|");
  const n = items.length;

  // New content → measure again.
  useLayoutEffect(() => {
    setFit(null);
  }, [signature]);

  // Measure phase: all badges (+ a sample « +N ») are in the DOM.
  useLayoutEffect(() => {
    if (fit !== null) return;
    const row = rowRef.current;
    if (!row) return;
    const kids = Array.from(row.children) as HTMLElement[];
    const widths = kids.slice(0, n).map((k) => k.getBoundingClientRect().width);
    const moreW = kids[n]?.getBoundingClientRect().width ?? 0;
    const avail = row.clientWidth;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    let k = pinned;
    for (let c = n; c >= pinned; c--) {
      const shown = widths.slice(0, c).reduce((a, b) => a + b, 0) + gap * Math.max(c - 1, 0);
      const more = c < n ? (c > 0 ? gap : 0) + moreW : 0;
      if (shown + more <= avail + 0.5) {
        k = c;
        break;
      }
    }
    lastWidth.current = avail;
    setFit(k);
  }, [fit, n, pinned, signature]);

  // Width changes (rotation, sheet resize) → measure again.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (Math.abs(row.clientWidth - lastWidth.current) > 1) setFit(null);
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  const measuring = fit === null;
  const shownCount = measuring ? n : fit;
  const hidden = n - shownCount;
  const moreCount = measuring ? Math.max(n - pinned, 1) : hidden;

  return (
    <div ref={rowRef} className={styles.row}>
      {items.slice(0, shownCount).map((i) => (
        <span key={i.key} className={styles.item}>
          {i.node}
        </span>
      ))}
      {(measuring || hidden > 0) && (
        <span className={styles.item} aria-hidden={measuring ? true : undefined}>
          <ParkBadge
            variant="age"
            size="md"
            label={`+${moreCount}`}
            accessibleLabel={t("state.more", { count: moreCount })}
          />
        </span>
      )}
    </div>
  );
}
