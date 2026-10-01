import { useNavigate } from "react-router-dom";
import { Button } from "@toboggo/design-system";
import type { Maintenance, Park } from "@toboggo/shared";
import { ParkLink } from "../../components/ParkLink";
import { Panel, PanelEmpty, CountBadge } from "../../components/Panel";
import styles from "../Dashboard.module.css";

const MAX_ROWS = 5;

// IMPORTANT (COLL-02C §5) : ce bloc s'appelle "Entretien à venir", jamais
// "Interventions" — la vraie feature Interventions est un lot séparé à venir.
export function UpcomingMaintenancePanel({ items, parkById }: { items: Maintenance[]; parkById: Map<string, Park> }) {
  const navigate = useNavigate();
  const recent = items.slice(0, MAX_ROWS);

  return (
    <Panel
      title="Entretien à venir"
      icon="ic-check"
      action={
        items.length > 0 && (
          <span className={styles.panelHeaderActions}>
            <CountBadge>{items.length}</CountBadge>
            <Button variant="ghost" size="sm" onClick={() => navigate("/maintenance")}>
              Voir tout
            </Button>
          </span>
        )
      }
    >
      {recent.length === 0 ? (
        <PanelEmpty icon="ic-check" text="Aucun entretien prévu prochainement." />
      ) : (
        <ul className={styles.panelList}>
          {recent.map((item) => (
            <li key={item.id} className={styles.panelRow}>
              <div className={styles.panelRowBody}>
                <div className={styles.panelRowTitle}>
                  {parkById.has(item.park_id) ? <ParkLink parkId={item.park_id}>{parkById.get(item.park_id)!.name}</ParkLink> : "Parc"}
                </div>
                <div className={styles.panelRowMeta}>
                  {new Date(item.date).toLocaleDateString("fr-FR")}
                  {item.note && ` · ${item.note}`} · {item.assignee ?? "Non assigné"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
