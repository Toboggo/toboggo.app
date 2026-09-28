import type { CSSProperties } from "react";
import clsx from "clsx";
import styles from "./Skeleton.module.css";

/**
 * Minimal, generic loading placeholder — a single shimmering block. Compose
 * several to approximate a screen's real layout while its data loads (see
 * the back office `Dashboard`'s skeleton), instead of a central spinner that
 * discards the page structure. Respects `prefers-reduced-motion`.
 */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = "var(--radius-xs)",
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={clsx(styles.skeleton, className)}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}
