import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import type { ActiveReport, ReportResponse } from "@toboggo/shared";
import styles from "./ReportAlertCard.module.css";

/**
 * Encart « Un problème a été signalé » de la fiche parc : lien vers le détail
 * + réponse communautaire (« Toujours présent » / « Problème résolu ») pour UN
 * signalement précis (sélecteur si plusieurs sont actifs).
 */
export function ReportAlertCard({
  reports,
  pending,
  error,
  onOpenDetails,
  onRespond,
}: {
  reports: ActiveReport[];
  /** Réponse en cours d'envoi (bloque les deux boutons). */
  pending: boolean;
  /** Dernier envoi en échec. */
  error: boolean;
  onOpenDetails: () => void;
  onRespond: (report: ActiveReport, response: ReportResponse) => void;
}) {
  const { t } = useTranslation("detail");
  const [selectedId, setSelectedId] = useState(reports[0]?.id);
  // Le signalement choisi peut disparaître (clos par la modération) : retour au plus récent.
  const selected = reports.find((r) => r.id === selectedId) ?? reports[0];
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);
  if (!selected) return null;

  const multiple = reports.length > 1;
  const answer = (response: ReportResponse) => (
    <button
      type="button"
      className={styles.answer}
      data-kind={response}
      data-selected={selected.my_response === response ? "1" : undefined}
      aria-pressed={selected.my_response === response}
      disabled={pending}
      onClick={() => onRespond(selected, response)}
    >
      <Icon name={response === "resolved" ? "ic-check" : "ic-warning"} size={18} />
      <span>{t(response === "resolved" ? "reportAlert.resolved" : "reportAlert.stillPresent")}</span>
    </button>
  );

  return (
    <section className={styles.card} aria-labelledby="report-alert-title">
      <button type="button" className={styles.head} onClick={onOpenDetails}>
        <span className={styles.headIcon} aria-hidden="true"><Icon name="ic-warning" size={26} /></span>
        <span className={styles.headText}>
          <span className={styles.title} id="report-alert-title">
            {t("reportAlert.title", { count: reports.length })}
          </span>
          <span className={styles.link}>{t("reportAlert.view", { count: reports.length })}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={styles.chevron}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      <div className={styles.divider} />

      <div className={styles.question}>{t("reportAlert.onSite")}</div>

      {multiple && (
        <label className={styles.pick}>
          <span className={styles.pickLabel}>{t("reportAlert.pickLabel")}</span>
          <select className={styles.select} value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {t(`reportCategory.${r.category}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={styles.answers}>
        {answer("still_present")}
        {answer("resolved")}
      </div>

      <div className={styles.status} aria-live="polite">
        {error ? (
          <span className={styles.error} role="alert">{t("reportAlert.error")}</span>
        ) : pending ? (
          t("reportAlert.sending")
        ) : selected.my_response ? (
          t("reportAlert.thanks")
        ) : null}
      </div>
    </section>
  );
}
