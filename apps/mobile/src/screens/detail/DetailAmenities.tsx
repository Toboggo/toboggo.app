import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark } from "../../lib/parksQuery";
import { presentPlayCodes } from "../../lib/parkEquipment";
import { ParkGlyph } from "../../components/addPark/ParkGlyph";
import { useFeatureLabel } from "../../lib/featureLabel";
import styles from "./DetailAmenities.module.css";

const SERVICE_KEYS = ["wc", "shade", "fenced", "pmr", "benches", "water", "parking"];

export default function DetailAmenities() {
  const { id } = useParams();
  const { t } = useTranslation("detail");
  const featureLabel = useFeatureLabel();
  const { data: park } = usePark(id);
  if (!park) return null;

  const rows: { code: string; label: string; on: boolean }[] = [
    ...presentPlayCodes(park).map((code) => ({ code, label: featureLabel(code), on: true })),
    ...SERVICE_KEYS.map((k) => ({
      code: k,
      label: featureLabel(k),
      on: Boolean((park as unknown as Record<string, unknown>)[k]),
    })),
  ];

  return (
    <div className={styles.screen}>
      <DetailHeader title={t("equipment.amenitiesTitle")} />
      <div className={styles.body}>
        {rows.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 13, marginTop: 40 }}>
            {t("equipment.amenitiesEmpty")}
          </p>
        )}
        {rows.map((r) => (
          <div key={r.label} className={styles.row}>
            <span className={styles.left}>
              <span className={styles.icon}>
                <ParkGlyph code={r.code} size={20} />
              </span>
              {r.label}
            </span>
            {r.on ? (
              <Icon name="ic-check" size={16} style={{ color: "var(--color-primary)" }} />
            ) : (
              <span className={styles.dash}>—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
