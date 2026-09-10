import { useTranslation } from "react-i18next";
import { Dialog } from "@toboggo/design-system";
import { useFilters, type AmenityFilters } from "../../lib/filters";
import styles from "./FiltersSheet.module.css";

const AMENITY_KEYS: (keyof AmenityFilters)[] = [
  "wc",
  "shade",
  "fenced",
  "pmr",
  "benches",
  "water",
  "parking",
];

export function FiltersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("map");
  const { ageLow, ageHigh, setAge, amenities, toggleAmenity, openNow, setOpenNow, reset } = useFilters();
  const pct = (v: number) => (v / 12) * 100;
  const ageValue =
    ageHigh >= 12
      ? t("filters.ageValuePlus", { min: ageLow, max: 12 })
      : t("filters.ageValue", { min: ageLow, max: ageHigh });

  return (
    <Dialog open={open} onClose={onClose} title={t("filters.title")}>
      <div className={styles.body}>
        <h6 className={styles.kicker}>{t("filters.ageRange")}</h6>
        <div className={styles.ageLabel}>{ageValue}</div>
        <div className={styles.slider}>
          <div className={styles.trackBg} />
          <div className={styles.trackFill} style={{ left: `${pct(ageLow)}%`, right: `${100 - pct(ageHigh)}%` }} />
          <input type="range" min={0} max={12} step={1} value={ageLow} onChange={(e) => setAge(Math.min(Number(e.target.value), ageHigh), ageHigh)} aria-label={t("filters.ageMin")} />
          <input type="range" min={0} max={12} step={1} value={ageHigh} onChange={(e) => setAge(ageLow, Math.max(Number(e.target.value), ageLow))} aria-label={t("filters.ageMax")} />
        </div>

        <h6 className={styles.kicker} style={{ marginTop: 26 }}>
          {t("filters.availability")}
        </h6>
        <div className={styles.toggleRow}>
          <span>{t("filters.openNow")}</span>
          <button type="button" className={styles.switch} data-on={openNow ? "1" : undefined} onClick={() => setOpenNow(!openNow)} aria-pressed={openNow}>
            <span className={styles.knob} />
          </button>
        </div>

        <h6 className={styles.kicker} style={{ marginTop: 26 }}>
          {t("filters.equipmentAccess")}
        </h6>
        <div className={styles.grid}>
          {AMENITY_KEYS.map((key) => (
            <button key={key} type="button" className={styles.crit} data-on={amenities[key] ? "1" : undefined} onClick={() => toggleAmenity(key)}>
              {t(`filters.amenity.${key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.reset} onClick={reset}>
          {t("filters.reset")}
        </button>
        <button type="button" className={styles.apply} onClick={onClose}>
          {t("filters.apply")}
        </button>
      </div>
    </Dialog>
  );
}
