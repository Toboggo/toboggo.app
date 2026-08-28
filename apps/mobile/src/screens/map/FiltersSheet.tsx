import { Dialog } from "@toboggo/design-system";
import { useFilters, type AmenityFilters } from "../../lib/filters";
import styles from "./FiltersSheet.module.css";

const AMENITY_LABELS: Record<keyof AmenityFilters, string> = {
  wc: "Toilettes",
  shade: "Ombragé",
  fenced: "Clôturé",
  pmr: "Accès PMR",
  benches: "Bancs",
  water: "Point d'eau",
  parking: "Parking",
};

export function FiltersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ageLow, ageHigh, setAge, amenities, toggleAmenity, openNow, setOpenNow, reset } = useFilters();
  const pct = (v: number) => (v / 12) * 100;
  const maxLabel = ageHigh >= 12 ? "12+" : String(ageHigh);

  return (
    <Dialog open={open} onClose={onClose} title="Filtres">
      <div className={styles.body}>
        <h6 className={styles.kicker}>Tranche d'âge</h6>
        <div className={styles.ageLabel}>
          De {ageLow} à {maxLabel} ans
        </div>
        <div className={styles.slider}>
          <div className={styles.trackBg} />
          <div className={styles.trackFill} style={{ left: `${pct(ageLow)}%`, right: `${100 - pct(ageHigh)}%` }} />
          <input type="range" min={0} max={12} step={1} value={ageLow} onChange={(e) => setAge(Math.min(Number(e.target.value), ageHigh), ageHigh)} aria-label="Âge minimum" />
          <input type="range" min={0} max={12} step={1} value={ageHigh} onChange={(e) => setAge(ageLow, Math.max(Number(e.target.value), ageLow))} aria-label="Âge maximum" />
        </div>

        <h6 className={styles.kicker} style={{ marginTop: 26 }}>
          Disponibilité
        </h6>
        <div className={styles.toggleRow}>
          <span>Ouvert maintenant</span>
          <button type="button" className={styles.switch} data-on={openNow ? "1" : undefined} onClick={() => setOpenNow(!openNow)} aria-pressed={openNow}>
            <span className={styles.knob} />
          </button>
        </div>

        <h6 className={styles.kicker} style={{ marginTop: 26 }}>
          Équipements &amp; accès
        </h6>
        <div className={styles.grid}>
          {(Object.keys(AMENITY_LABELS) as (keyof AmenityFilters)[]).map((key) => (
            <button key={key} type="button" className={styles.crit} data-on={amenities[key] ? "1" : undefined} onClick={() => toggleAmenity(key)}>
              {AMENITY_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.reset} onClick={reset}>
          Réinitialiser
        </button>
        <button type="button" className={styles.apply} onClick={onClose}>
          Voir les résultats
        </button>
      </div>
    </Dialog>
  );
}
