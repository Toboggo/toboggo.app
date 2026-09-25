import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./FilterBar.module.css";

export interface FilterBarProps {
  /** Filter controls (Input/Select/Segmented, …) — the bar has no filter
   * logic of its own, screens keep their own state/handlers. */
  children: ReactNode;
  /** Right-aligned actions (export button, etc.). Wraps onto its own row on
   * narrow viewports rather than overlapping the filters. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Layout-only primitive (Admin-UI-7B — Visual Foundation) standardizing the
 * search/selects/segmented + right-aligned-actions row already repeated ad
 * hoc across several screens (Reports/Parks/Photos/Reviews each hand-roll a
 * `<div style={{ display: "flex", gap: ... }}>`). Not wired into any screen
 * yet — this lot only introduces the primitive.
 */
export function FilterBar({ children, actions, className }: FilterBarProps) {
  return (
    <div className={clsx(styles.bar, className)}>
      <div className={styles.filters}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
