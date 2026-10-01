import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@toboggo/design-system";
import { useFormat } from "../../i18n/useFormat";
import { RADIUS_OPTIONS_KM, type RadiusKm } from "../../lib/nearbyRadius";
import styles from "./RadiusSheet.module.css";

/**
 * "Zone de recherche" picker — same `Dialog` shell as `FiltersSheet`. The
 * choice is a local draft until "Appliquer": closing without applying leaves
 * the active radius untouched.
 */
export function RadiusSheet({
  open,
  value,
  onApply,
  onClose,
}: {
  open: boolean;
  value: RadiusKm;
  onApply: (r: RadiusKm) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("map");
  const f = useFormat();
  const [draft, setDraft] = useState<RadiusKm>(value);

  // Every opening starts from the radius actually in force.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Dialog open={open} onClose={onClose} title={t("nearby.radius.title")}>
      <p className={styles.subtitle}>{t("nearby.radius.subtitle")}</p>
      <div className={styles.options} role="radiogroup" aria-label={t("nearby.radius.title")}>
        {RADIUS_OPTIONS_KM.map((r) => {
          const on = draft === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              className={styles.option}
              data-on={on ? "1" : undefined}
              onClick={() => setDraft(r)}
            >
              <span className={styles.radio} aria-hidden />
              <span className={styles.optionText}>
                <span className={styles.optionValue}>{f.distance(r * 1000)}</span>
                <span className={styles.optionHint}>{t(`nearby.radius.hint.${r}`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.apply} onClick={() => onApply(draft)}>
        {t("nearby.radius.apply")}
      </button>
    </Dialog>
  );
}
