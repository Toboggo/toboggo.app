import type { ReactNode } from "react";
import { Icon, Skeleton, type IconName } from "@toboggo/design-system";
import styles from "./StatStrip.module.css";

export interface StatStripItem {
  key: string;
  label: string;
  value: ReactNode;
  /** Pictogramme du sprite (même système d'icônes que les KPI de premier niveau). */
  icon?: IconName;
  onClick?: () => void;
  loading?: boolean;
  error?: boolean;
}

/**
 * Bandeau de chiffres secondaires (niveau 2 d'un tableau de bord) : une seule
 * surface, des séparateurs fins, pas une carte par chiffre. Les KPI de premier
 * niveau restent des `StatCard` ; ce composant porte les indicateurs de
 * contexte (totaux plateforme, patrimoine…) sans leur donner le même poids.
 */
export function StatStrip({ items, label }: { items: StatStripItem[]; label: string }) {
  return (
    <div className={styles.strip} role="group" aria-label={label}>
      {items.map((item) => {
        const body = (
          <>
            {item.icon && (
              <span className={styles.icon} aria-hidden="true">
                <Icon name={item.icon} size={15} />
              </span>
            )}
            <span className={styles.value}>
              {item.error ? <span title="Indisponible">—</span> : item.loading ? <Skeleton width={28} height={18} /> : item.value}
            </span>
            <span className={styles.label}>{item.label}</span>
          </>
        );
        return item.onClick ? (
          <button key={item.key} type="button" className={styles.item} onClick={item.onClick}>
            {body}
          </button>
        ) : (
          <div key={item.key} className={styles.item}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
