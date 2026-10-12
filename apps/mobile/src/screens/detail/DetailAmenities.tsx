import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DetailHeader } from "../../components/DetailHeader";
import { AmenityBadge } from "../../components/ParkBadge";
import { usePark } from "../../lib/parksQuery";
import { amenityEntries, type AmenityEntry, type AmenityState } from "../../lib/parkAmenities";
import styles from "./DetailAmenities.module.css";

const STATES: AmenityState[] = ["present", "absent", "unknown"];

/** « Voir tout » : everything the park says about its equipment and services,
 * grouped by state — present, explicitly absent, to confirm. Unknown is never
 * shown as absent. */
export default function DetailAmenities() {
  const { id } = useParams();
  const { t } = useTranslation("detail");
  const { t: tf } = useTranslation("features");
  const { data: park } = usePark(id);
  if (!park) return null;

  const entries = amenityEntries(park);
  const groups = STATES.map((state) => ({ state, items: entries.filter((e: AmenityEntry) => e.state === state) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className={styles.screen}>
      <DetailHeader title={t("equipment.amenitiesTitle")} />
      <div className={styles.body}>
        {groups.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 13, marginTop: 40 }}>
            {t("equipment.amenitiesEmpty")}
          </p>
        )}
        {groups.map((g) => (
          <section key={g.state} className={styles.group} aria-labelledby={`amenities-${g.state}`}>
            <h2 id={`amenities-${g.state}`} className={styles.groupTitle}>
              {tf(`state.titles.${g.state}`)}
            </h2>
            <div className={styles.badges}>
              {g.items.map((e) => (
                <AmenityBadge key={`${e.kind}:${e.code}`} entry={e} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
