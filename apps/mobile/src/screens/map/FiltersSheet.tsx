import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import { ParkGlyph } from "../../components/addPark/ParkGlyph";
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

  // Échap ferme le panneau (comme un Dialog) ; le fond de page ne défile pas.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <Icon name="ic-settings" size={20} />
          <h2 className={styles.title} id="filters-title">
            {t("filters.title")}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("filters.close")}>
            <Icon name="ic-close" size={20} />
          </button>
        </header>

        <div className={styles.body}>
          <section className={styles.section} aria-labelledby="filters-age">
            <h3 className={styles.sectionTitle} id="filters-age">
              {t("filters.ageRange")}
            </h3>
            <div className={styles.ageLabel} aria-live="polite">
              {ageValue}
            </div>
            <div className={styles.slider}>
              <div className={styles.trackBg} />
              <div className={styles.trackFill} style={{ left: `${pct(ageLow)}%`, right: `${100 - pct(ageHigh)}%` }} />
              <input type="range" min={0} max={12} step={1} value={ageLow} onChange={(e) => handleAgeChange(Math.min(Number(e.target.value), ageHigh), ageHigh)} aria-label={t("filters.ageMin")} />
              <input type="range" min={0} max={12} step={1} value={ageHigh} onChange={(e) => handleAgeChange(ageLow, Math.max(Number(e.target.value), ageLow))} aria-label={t("filters.ageMax")} />
            </div>
          </section>

          <section className={styles.section} aria-labelledby="filters-availability">
            <h3 className={styles.sectionTitle} id="filters-availability">
              {t("filters.availability")}
            </h3>
            <div className={styles.toggleRow}>
              <span className={styles.toggleGlyph} aria-hidden="true">
                <Icon name="ic-clock" size={18} />
              </span>
              <span className={styles.toggleLabel} id="filters-open-now">
                {t("filters.openNow")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={openNow}
                aria-labelledby="filters-open-now"
                className={styles.switch}
                data-on={openNow ? "1" : undefined}
                onClick={() => setOpenNow(!openNow)}
              >
                <span className={styles.knob} />
              </button>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="filters-equipment">
            <h3 className={styles.sectionTitle} id="filters-equipment">
              {t("filters.equipmentAccess")}
            </h3>
            <div className={styles.grid}>
              {AMENITY_KEYS.map((key) => {
                const on = amenities[key];
                return (
                  <button key={key} type="button" className={styles.crit} aria-pressed={on} onClick={() => handleToggleAmenity(key)}>
                    <span className={styles.critGlyph} aria-hidden="true">
                      <ParkGlyph code={key} size={22} />
                    </span>
                    <span className={styles.critLabel}>{t(`filters.amenity.${key}`)}</span>
                    {on && (
                      <span className={styles.critCheck} aria-hidden="true">
                        <Icon name="ic-check" size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.reset} onClick={reset}>
            {t("filters.reset")}
          </button>
          <button type="button" className={styles.apply} onClick={onClose}>
            {t("filters.apply")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
