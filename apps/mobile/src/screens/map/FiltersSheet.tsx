import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@toboggo/design-system";
import { useFilters, type AmenityFilters } from "../../lib/filters";
import { trackEvent } from "../../lib/analytics";
import styles from "./FiltersSheet.module.css";

// Débounce dédié à l'émission analytics du slider d'âge — ne change rien au
// comportement réel du filtre (`setAge` reste appelé à chaque tick,
// immédiat), seulement à quand l'événement `filter_applied` correspondant
// est envoyé, pour ne pas envoyer un événement par pixel glissé.
const AGE_FILTER_TRACK_DEBOUNCE_MS = 400;

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

  // Slider natif = beaucoup de `onChange` par glissement — `setAge` reste
  // appelé à chaque tick (comportement inchangé), seul l'événement analytics
  // est débounced sur la valeur finale.
  const ageTrackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (ageTrackTimer.current) clearTimeout(ageTrackTimer.current);
  }, []);
  function handleAgeChange(low: number, high: number) {
    setAge(low, high);
    if (ageTrackTimer.current) clearTimeout(ageTrackTimer.current);
    ageTrackTimer.current = setTimeout(() => {
      trackEvent("filter_applied", { filter_type: "age", filter_value: `${low}-${high >= 12 ? "12+" : high}` });
    }, AGE_FILTER_TRACK_DEBOUNCE_MS);
  }

  // "Ouvert maintenant" n'a aucun effet réel sur les résultats
  // (ANALYTICS-AUDIT.md §7) — volontairement PAS instrumenté comme un vrai
  // filtre appliqué, pour ne pas faire croire qu'il change quoi que ce soit.
  function handleToggleAmenity(key: keyof AmenityFilters) {
    toggleAmenity(key);
    trackEvent("filter_applied", { filter_type: "amenity", filter_value: key });
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("filters.title")}>
      <div className={styles.body}>
        <h6 className={styles.kicker}>{t("filters.ageRange")}</h6>
        <div className={styles.ageLabel}>{ageValue}</div>
        <div className={styles.slider}>
          <div className={styles.trackBg} />
          <div className={styles.trackFill} style={{ left: `${pct(ageLow)}%`, right: `${100 - pct(ageHigh)}%` }} />
          <input type="range" min={0} max={12} step={1} value={ageLow} onChange={(e) => handleAgeChange(Math.min(Number(e.target.value), ageHigh), ageHigh)} aria-label={t("filters.ageMin")} />
          <input type="range" min={0} max={12} step={1} value={ageHigh} onChange={(e) => handleAgeChange(ageLow, Math.max(Number(e.target.value), ageLow))} aria-label={t("filters.ageMax")} />
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
            <button key={key} type="button" className={styles.crit} data-on={amenities[key] ? "1" : undefined} onClick={() => handleToggleAmenity(key)}>
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
