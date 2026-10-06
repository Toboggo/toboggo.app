import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import styles from "./FaceChoice.module.css";

/**
 * Visages au trait (même famille que les pictos de l'app : 24×24, trait 1.7,
 * extrémités arrondies, `currentColor`). Décoratifs : le libellé visible porte le sens.
 */
const MOUTH: Record<1 | 2 | 3, string> = {
  1: "M8.4 16.2c.9-1.4 2.1-2.1 3.6-2.1s2.7.7 3.6 2.1", // mécontent
  2: "M8.8 15.2h6.4", // neutre
  3: "M8.4 14c.9 1.5 2.1 2.3 3.6 2.3s2.7-.8 3.6-2.3", // souriant
};

export function FaceIcon({ level, size = 28 }: { level: 1 | 2 | 3; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r=".6" fill="currentColor" />
      <circle cx="15" cy="10" r=".6" fill="currentColor" />
      <path d={MOUTH[level]} />
    </svg>
  );
}

const LEVELS = [1, 2, 3] as const;

/**
 * Un critère d'avis : trois choix (Mauvais / Moyen / Bon) sur une ligne. Les valeurs
 * émises sont exactement 1, 2 et 3 (inchangées). Groupe nommé par le critère ; état
 * annoncé (`aria-checked`) ; la sélection se voit aussi par une coche, pas seulement
 * par la couleur ; flèches gauche/droite déplacent le choix (tabulation sur le choix actif).
 */
export function FaceChoice({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: 1 | 2 | 3) => void;
}) {
  const { t } = useTranslation("contribute");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    const next = LEVELS[(to + LEVELS.length) % LEVELS.length];
    onChange(next);
    refs.current[next - 1]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent, level: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(level);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(level - 2);
    }
  };
  // Tabulation : le choix actif, ou le premier tant qu'aucune valeur valide n'existe.
  const tabbable = LEVELS.includes(value as 1 | 2 | 3) ? value : 1;

  return (
    <div className={styles.row}>
      <span className={styles.label} id={`face-${id}`}>
        {label}
      </span>
      <div className={styles.group} role="radiogroup" aria-labelledby={`face-${id}`}>
        {LEVELS.map((level) => {
          const on = value === level;
          return (
            <button
              key={level}
              ref={(el) => {
                refs.current[level - 1] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={level === tabbable ? 0 : -1}
              className={styles.choice}
              onClick={() => onChange(level)}
              onKeyDown={(e) => onKeyDown(e, level)}
            >
              <FaceIcon level={level} />
              <span className={styles.choiceText}>{t(`rate.face.${level}`)}</span>
              {on && (
                <span className={styles.check} aria-hidden="true">
                  <Icon name="ic-check" size={10} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
