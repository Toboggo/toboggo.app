import type { ReactNode } from "react";
import { Icon, type IconName } from "@toboggo/design-system";
import styles from "./Panel.module.css";

export { styles as panelStyles };

/** Compact panel shell shared by the COLL-02C "aperçu opérationnel" cards and
 * the COLL-03 parks screens — semantic icon + title, optional header action
 * (a "Voir tout" button, a real count badge, or both), nothing else. Not a new
 * design system: just the header row that would otherwise be copy-pasted. */
export function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.neutralCard}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderTitle}>
          {icon && (
            <span className={styles.panelIcon}>
              <Icon name={icon} size={15} />
            </span>
          )}
          <h2 className={styles.sectionTitle}>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Compact empty state — a small centered icon badge + text, not a stray
 * line lost in a mostly-blank card (COLL-02D §4/§6). */
export function PanelEmpty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={18} />
      </span>
      {text}
    </div>
  );
}

/** Amber count pill — only for a real count that calls for an action. */
export function CountBadge({ children }: { children: ReactNode }) {
  return <span className={styles.countBadge}>{children}</span>;
}
