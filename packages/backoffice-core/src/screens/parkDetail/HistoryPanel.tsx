import { useQuery } from "@tanstack/react-query";
import { getParkHistory } from "@toboggo/shared";
import styles from "../ParkDetail.module.css";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// `getParkHistory` falls back to `audit_log.source` (always the literal default
// `"app"` for parks — it carries no real actor) then to `"Système"`. None of
// these tell a collectivité anything, and a bare `actor_id` UUID is worse — so
// the actor line is shown only when it is a plausible human/organisation name.
const NON_INFORMATIVE = new Set(["", "app", "système", "systeme", "system"]);

function actorLabel(actor: string | null | undefined): string | null {
  const a = actor?.trim();
  if (!a || NON_INFORMATIVE.has(a.toLowerCase()) || UUID_RE.test(a)) return null;
  return a;
}

export function HistoryPanel({ parkId }: { parkId: string }) {
  const { data: history = [], isLoading, isError } = useQuery({
    queryKey: ["park-history", parkId],
    queryFn: () => getParkHistory(parkId),
  });

  if (isLoading) return <p className={styles.stateBox}>Chargement de l'historique…</p>;
  if (isError) return <p className={styles.stateBox}>Impossible de charger l'historique.</p>;
  if (history.length === 0) return <p className={styles.stateBox}>Aucun évènement enregistré pour ce parc.</p>;

  return (
    <div className={styles.panel}>
      <ol className={styles.timeline}>
        {history.map((h) => {
          const actor = actorLabel(h.actor);
          return (
            <li key={h.id} className={styles.event}>
              <span className={styles.eventDate}>{dateTimeFmt.format(new Date(h.created_at))}</span>
              <div>
                <span className={styles.eventAction}>{h.action}</span>
                {h.note ? <span>{` — ${h.note}`}</span> : null}
                {actor ? <span className={styles.eventMeta}>{actor}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
