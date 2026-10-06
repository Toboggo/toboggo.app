import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import type { ActiveReport } from "@toboggo/shared";
import styles from "./ReportAlertBanner.module.css";

/** Seconde ligne de la bannière : réponse de l'utilisateur (1 signalement) ou résumé (plusieurs). */
export function reportAnswerSummary(reports: ActiveReport[], t: (key: string, opts?: Record<string, unknown>) => string): string | null {
  const answered = reports.filter((r) => r.my_response);
  if (answered.length === 0) return null;
  if (reports.length === 1) return t(`reportAlert.yourAnswer.${answered[0]!.my_response}`);
  // Plusieurs signalements : jamais une réponse attribuée à tous.
  return t("reportAlert.answeredSummary", { answered: answered.length, count: reports.length });
}

/**
 * Bannière compacte « Signalement en cours » de la fiche parc, entièrement
 * cliquable : ouvre le détail (où l'on répond « Toujours présent » / « Problème résolu »).
 */
export function ReportAlertBanner({ reports, onOpen }: { reports: ActiveReport[]; onOpen: () => void }) {
  const { t } = useTranslation("detail");
  const summary = reportAnswerSummary(reports, t);
  return (
    <button type="button" className={styles.banner} onClick={onOpen}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name="ic-warning" size={22} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{t("reportAlert.banner", { count: reports.length })}</span>
        {summary && <span className={styles.answer} aria-live="polite">{summary}</span>}
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={styles.chevron}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
