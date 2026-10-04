import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon, IconButton } from "@toboggo/design-system";
import { ParkGlyph } from "./ParkGlyph";
import { AGE_BANDS, type Answer, type ServiceKey } from "../../lib/addParkModel";
import styles from "./AddPark.module.css";

/** En-tête compact : retour · titre · fermeture, « Étape X sur N », barre de progression. */
export function AddParkHeader({
  step,
  total,
  onBack,
  onClose,
}: {
  /** Index 0-based de l'étape courante. */
  step: number;
  total: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");
  const stepLabel = t("addPark.stepOf", { current: step + 1, total });
  return (
    <header className={styles.header}>
      <div className={styles.headerRow}>
        <IconButton aria-label={tCommon("action.back")} onClick={onBack}>
          <Icon name="ic-back" size={18} />
        </IconButton>
        <h1 className={styles.headerTitle}>{t("addPark.headerTitle")}</h1>
        <IconButton aria-label={tCommon("action.close")} onClick={onClose}>
          <Icon name="ic-close" size={18} />
        </IconButton>
      </div>
      <p className={styles.stepMeta}>{stepLabel}</p>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label={stepLabel}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
      >
        <div className={styles.progressFill} style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>
    </header>
  );
}

export interface GameOption {
  code: string;
  label: string;
}

/** Grille 3 colonnes de cartes de jeux, sélection multiple. */
export function GameGrid({
  games,
  selected,
  onToggle,
}: {
  games: GameOption[];
  selected: ReadonlySet<string>;
  onToggle: (code: string) => void;
}) {
  return (
    <div className={styles.gameGrid}>
      {games.map((g) => {
        const on = selected.has(g.code);
        return (
          <button
            key={g.code}
            type="button"
            className={styles.gameCard}
            aria-pressed={on}
            onClick={() => onToggle(g.code)}
          >
            <ParkGlyph code={g.code} size={30} />
            <span className={styles.gameLabel}>{g.label}</span>
            {on && (
              <span className={styles.gameCheck} aria-hidden="true">
                <Icon name="ic-check" size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Tranches d'âge (sélection multiple contiguë) + choix exclusif « Je ne sais pas ». */
export function AgeButtons({
  bands,
  unknown,
  onToggleBand,
  onUnknown,
  rejected,
}: {
  bands: readonly string[];
  unknown: boolean;
  onToggleBand: (id: (typeof AGE_BANDS)[number]["id"]) => void;
  onUnknown: () => void;
  /** Dernier geste refusé car il aurait produit des tranches disjointes. */
  rejected: boolean;
}) {
  const { t } = useTranslation("contribute");
  return (
    <>
      <div className={styles.ageGrid}>
        {AGE_BANDS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={styles.pill}
            aria-pressed={bands.includes(b.id)}
            onClick={() => onToggleBand(b.id)}
          >
            {t(`addPark.ages.band.${b.id}`)}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.pill} ${styles.pillWide}`}
          aria-pressed={unknown}
          onClick={onUnknown}
        >
          {t("addPark.ages.unknown")}
        </button>
      </div>
      <div aria-live="polite">{rejected && <p className={styles.note}>{t("addPark.ages.contiguousHint")}</p>}</div>
    </>
  );
}

/** Une ligne « picto · libellé · Oui / Non / ? ». Inconnu par défaut. */
export function TriStateRow({
  serviceKey,
  label,
  value,
  onChange,
}: {
  serviceKey: ServiceKey;
  label: string;
  value: Answer | undefined;
  onChange: (value: Answer | null) => void;
}) {
  const { t } = useTranslation("contribute");
  const options: { id: "yes" | "no" | "unknown"; text: string; aria: string; next: Answer | null }[] = [
    { id: "yes", text: t("addPark.answer.yes"), aria: t("addPark.answer.yes"), next: "yes" },
    { id: "no", text: t("addPark.answer.no"), aria: t("addPark.answer.no"), next: "no" },
    { id: "unknown", text: t("addPark.answer.unknown"), aria: t("addPark.answer.unknownAria"), next: null },
  ];
  const current = value ?? "unknown";
  return (
    <div className={styles.triRow}>
      <span className={styles.triGlyph} aria-hidden="true">
        <ParkGlyph code={serviceKey} size={20} />
      </span>
      <span className={styles.triLabel} id={`tri-${serviceKey}`}>
        {label}
      </span>
      <div className={styles.triGroup} role="radiogroup" aria-labelledby={`tri-${serviceKey}`}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={current === o.id}
            aria-label={o.aria}
            data-value={o.id}
            className={styles.triBtn}
            onClick={() => onChange(o.next)}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Carte du récapitulatif avec son bouton « Modifier ». */
export function SummaryCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  const { t } = useTranslation("contribute");
  return (
    <section className={styles.summaryCard}>
      <div className={styles.summaryHead}>
        <span className={styles.summaryTitle}>{title}</span>
        <button type="button" className={styles.summaryEdit} onClick={onEdit} aria-label={`${t("common.edit")} — ${title}`}>
          {t("common.edit")}
        </button>
      </div>
      {children}
    </section>
  );
}
