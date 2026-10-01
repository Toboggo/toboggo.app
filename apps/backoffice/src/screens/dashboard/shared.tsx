import type { ReactNode } from "react";
import { Icon, type IconName } from "@toboggo/design-system";
import styles from "../Dashboard.module.css";

/** "il y a 3 h" style, with the exact timestamp always available via `title`
 * (hover / screen reader) — never lose the precise date, just lead with the
 * human-readable one. Shared by every Dashboard panel that lists real,
 * timestamped rows (COLL-02C). */
export function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `il y a ${diffD} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

/** Compact panel shell shared by every COLL-02C "aperçu opérationnel" card —
 * semantic icon + title, optional header action (a "Voir tout" button, a
 * real count badge, or both), nothing else. Not a new design system: just
 * the header row that would otherwise be copy-pasted identically six times
 * (Signalements / Infos à vérifier / Entretien / Avis / Pilotage / Carte). */
export function DashboardPanel({
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
