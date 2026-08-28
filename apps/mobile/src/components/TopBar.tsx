import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./TopBar.module.css";

/**
 * Sub-screen header — 38px circular back button + Fredoka title,
 * matching the Claude Design prototype. Kept as `TopBar` so the many
 * screens already importing it pick up the new look automatically.
 */
export function TopBar({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className={styles.wrap}>
      <button
        type="button"
        className={styles.back}
        onClick={onBack ?? (() => navigate(-1))}
        aria-label="Retour"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      {title && <h1 className={styles.title}>{title}</h1>}
      {right && <div className={styles.right}>{right}</div>}
    </header>
  );
}
