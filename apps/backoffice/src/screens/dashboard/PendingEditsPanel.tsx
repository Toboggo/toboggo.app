import type { Json, ParkEdit, Park } from "@toboggo/shared";
import { ParkLink } from "../../components/ParkLink";
import { Panel, PanelEmpty, CountBadge } from "../../components/Panel";
import { relativeTime } from "../../lib/relativeTime";
import styles from "../Dashboard.module.css";

const MAX_ROWS = 5;

/** `park_edits.changes` is a free-form `jsonb` blob (§13) — the only shape
 * every submission actually shares is `{ items: [{ label, ... }] }` (see
 * `submitParkEdit` callers on mobile). Reads it defensively rather than
 * trusting an unenforced shape. */
function changeLabels(changes: Json): string[] {
  if (typeof changes !== "object" || changes === null || Array.isArray(changes)) return [];
  const items = changes.items;
  if (!Array.isArray(items)) return [];
  const labels: string[] = [];
  for (const item of items) {
    if (typeof item === "object" && item !== null && !Array.isArray(item) && typeof item.label === "string") {
      labels.push(item.label);
    }
  }
  return labels;
}

export function PendingEditsPanel({ edits, parkById }: { edits: ParkEdit[]; parkById: Map<string, Park> }) {
  const recent = edits.slice(0, MAX_ROWS);

  return (
    // No "Voir tout" action: no dedicated screen exists yet for park_edits
    // (§5) — a plain, honest count badge in the header instead of a dead
    // link. This header badge is now the only place that count appears
    // (COLL-02D §2 — the old "À traiter" row duplicated it).
    <Panel
      title="Infos à vérifier"
      icon="ic-question"
      action={edits.length > 0 && <CountBadge>{edits.length}</CountBadge>}
    >
      {recent.length === 0 ? (
        <PanelEmpty icon="ic-question" text="Aucune information à vérifier." />
      ) : (
        <ul className={styles.panelList}>
          {recent.map((edit) => {
            const labels = edit.park_id ? changeLabels(edit.changes) : [];
            return (
              <li key={edit.id} className={styles.panelRow}>
                <div className={styles.panelRowBody}>
                  <div className={styles.panelRowTitle}>
                    {edit.park_id && parkById.has(edit.park_id) ? (
                      <ParkLink parkId={edit.park_id}>{parkById.get(edit.park_id)!.name}</ParkLink>
                    ) : (
                      "Parc"
                    )}
                  </div>
                  <div className={styles.panelRowMeta}>
                    {labels.length > 0 ? labels.join(", ") : "Modification proposée"} ·{" "}
                    <time dateTime={edit.created_at} title={new Date(edit.created_at).toLocaleString("fr-FR")}>
                      {relativeTime(edit.created_at)}
                    </time>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
