import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./DetailHeader.module.css";

/**
 * Shared sub-screen header from the Claude Design prototype:
 * a 38px circular back button + a Fredoka 19px title.
 */
export function DetailHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={onBack ?? (() => navigate(-1))} aria-label="Retour">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h2 className={styles.title}>{title}</h2>
      {right && <div className={styles.right}>{right}</div>}
    </div>
  );
}
