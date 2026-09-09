import type { ReactNode } from "react";
import { Icon, type IconName } from "@toboggo/design-system";
import styles from "./SheetState.module.css";

/**
 * Compact status block for the Explore bottom-sheet. Sized to its content — it
 * never leaves a big empty white panel. Used for loading / empty / error /
 * location states so each is visually distinct.
 */
export function SheetState({
  iconName,
  title,
  description,
  action,
  tone = "neutral",
}: {
  iconName: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon} data-tone={tone}>
        <Icon name={iconName} size={22} />
      </div>
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.desc}>{description}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export function SheetLoading() {
  return (
    <div className={styles.wrap}>
      <div className={styles.skeletonRow}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skelCard} />
        ))}
      </div>
      <div className={styles.loadingLabel}>Recherche des parcs autour de vous…</div>
    </div>
  );
}
