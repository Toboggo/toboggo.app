import type { ReactNode } from "react";
import clsx from "clsx";
import { TopBar } from "../../components/TopBar";
import styles from "./SettingsKit.module.css";

/** Page « Compte et réglages » : fond gris très clair, retour en carré arrondi, contenu en cartes. */
export function SettingsPage({
  title,
  onBack,
  right,
  children,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={clsx("screen", styles.page)}>
      <TopBar title={title} onBack={onBack} right={right} className={styles.topBar} backClassName={styles.backSquare} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <>
      {title && <h6 className={styles.kicker}>{title}</h6>}
      <div className={styles.card}>{children}</div>
    </>
  );
}

export function SettingsCard({ children, padded }: { children: ReactNode; padded?: boolean }) {
  return <div className={clsx(styles.card, padded && styles.cardPad)}>{children}</div>;
}

export function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)" }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function NavRow({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span>{label}</span>
      <span className={styles.rowTrailing}>
        {value}
        <Chevron />
      </span>
    </button>
  );
}

/** Choix unique accessible (radiogroup) ; la sélection est marquée par une coche verte. */
export function ChoiceList<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.card} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={clsx(styles.row, styles.choice)}
          onClick={() => onChange(o.value)}
        >
          <span className={styles.rowLabel}>
            <span>{o.label}</span>
            {o.hint && <span className={styles.rowHint}>{o.hint}</span>}
          </span>
          <span className={styles.radio} aria-hidden>
            {o.value === value && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export { styles as kit };
