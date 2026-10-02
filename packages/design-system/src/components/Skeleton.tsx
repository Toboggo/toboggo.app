import type { CSSProperties } from "react";
import clsx from "clsx";
import styles from "./Skeleton.module.css";

/**
 * Shimmering loading placeholder (collectivité Dashboard / Mes parcs). Distinct from `Skeleton` in `Misc` (the Admin pulse placeholder, Admin-UI-7B): same idea, two looks, both kept. Compose
 * several to approximate a screen's real layout while its data loads (see
 * the back office `Dashboard`'s skeleton), instead of a central spinner that
 * discards the page structure. Respects `prefers-reduced-motion`.
 */
export function ShimmerSkeleton({
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
