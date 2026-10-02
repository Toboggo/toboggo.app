import { Panel } from "../../components/Panel";
import { computeCompleteness, type CompletenessKey } from "../../lib/parkCompleteness";
import { Icon } from "@toboggo/design-system";
import type { Park } from "@toboggo/shared";
import styles from "./ParkOverview.module.css";

export type OverviewTab = "info" | "features" | "photos";

/** Where each missing information is filled in. */
const TAB_FOR: Record<CompletenessKey, OverviewTab> = {
  address: "info",
  ages: "info",
  description: "info",
  photo: "photos",
  features: "features",
};

/**
 * Collectivité-only « État du parc » (COLL-03C), above the detail tabs:
 * which of the 5 key informations are filled in, and where to complete the
 * missing ones. Reports, edit proposals, reviews, sources and photos already
 * have their own tab / header on the shared park page — nothing is duplicated
 * here. Derived from existing fields only (`computeCompleteness`).
 */
export function ParkOverview({
  park,
  canEdit,
  onOpenTab,
}: {
  park: Park;
  canEdit: boolean;
  onOpenTab: (tab: OverviewTab) => void;
}) {
  const completeness = computeCompleteness(park);

  return (
    <div className={styles.grid}>
      <Panel
        title="État du parc"
        icon="ic-check"
        action={
          <span className={styles.progress}>
            {completeness.filled}/{completeness.total} renseignées
          </span>
        }
      >
        <ul className={styles.checklist}>
          {completeness.items.map((item) => (
            <li key={item.key} className={styles.checkItem}>
              <span className={item.done ? styles.done : styles.todo} aria-hidden="true">
                {item.done ? <Icon name="ic-check" size={12} /> : "·"}
              </span>
              <span className={styles.checkLabel}>{item.label}</span>
              {item.done ? (
                <span className={styles.ok}>Renseignée</span>
              ) : canEdit ? (
                <button type="button" className={styles.link} onClick={() => onOpenTab(TAB_FOR[item.key])}>
                  À compléter
                </button>
              ) : (
                <span className={styles.muted}>À compléter</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
