import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DetailHeader } from "../../components/DetailHeader";
import { ParkGlyph } from "../../components/addPark/ParkGlyph";
import { usePark } from "../../lib/parksQuery";
import { useFeatureLabel } from "../../lib/featureLabel";
import { amenityEntries, type AmenityState } from "../../lib/parkAmenities";
import styles from "./DetailAmenities.module.css";

const STATES: AmenityState[] = ["present", "absent", "unknown"];

/** « Voir tout » : everything the park says about its equipment and services,
 * grouped by state — present, explicitly absent, to confirm — in a regular
 * two-column grid (pictogram, short name, then a discreet status line). Unknown
 * is never shown as absent; « Vérifié » only appears with a verification date. */
export default function DetailAmenities() {
  const { id } = useParams();
  const { t } = useTranslation("detail");
  const { t: tf } = useTranslation("features");
  const featureLabel = useFeatureLabel();
  const { data: park } = usePark(id);
  if (!park) return null;

  const entries = amenityEntries(park);
  const groups = STATES.map((state) => ({ state, items: entries.filter((e) => e.state === state) })).filter((g) => g.items.length > 0);

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
            <ul className={styles.grid}>
              {g.items.map((e) => {
                const status = g.state === "present" ? null : tf(`state.short.${g.state}`);
                const verified = e.verified ? tf("state.verified") : null;
                return (
                  <li key={`${e.kind}:${e.code}`} className={styles.cell} data-state={g.state}>
                    <span className={styles.icon} aria-hidden>
                      <ParkGlyph code={e.code} size={22} />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.name}>{e.kind === "service" ? tf(`state.name.${e.code}`) : featureLabel(e.code)}</span>
                      {(status || verified) && (
                        <span className={styles.meta}>{[status, verified].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
