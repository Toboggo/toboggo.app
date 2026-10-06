import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet, Button, Icon } from "@toboggo/design-system";
import type { ActiveReport, ReportResponse } from "@toboggo/shared";
import { useFormat } from "../i18n/useFormat";
import styles from "./ReportDetailsSheet.module.css";

/**
 * Détails PUBLICS des signalements actifs d'un parc (catégorie, description,
 * date, confirmations — jamais l'auteur ni la photo) + réponse communautaire
 * « Toujours présent » / « Problème résolu » pour UN signalement précis
 * (sélecteur si plusieurs). Un vote ne clôture jamais le signalement.
 */
export function ReportDetailsSheet({
  open,
  onClose,
  reports,
  pending,
  error,
  onRespond,
  onReportAnother,
}: {
  open: boolean;
  onClose: () => void;
  reports: ActiveReport[];
  /** Réponse en cours d'envoi (bloque les deux boutons). */
  pending: boolean;
  /** Dernier envoi en échec. */
  error: boolean;
  onRespond: (report: ActiveReport, response: ReportResponse) => void;
  onReportAnother: () => void;
}) {
  const { t } = useTranslation("detail");
  const { t: tc } = useTranslation("common");
  const f = useFormat();
  const [selectedId, setSelectedId] = useState(reports[0]?.id);
  // Le signalement choisi peut disparaître (clos par la modération) : retour au plus récent.
  const selected = reports.find((r) => r.id === selectedId) ?? reports[0];
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const title = t("reportAlert.sheetTitle", { count: reports.length });
  const answer = (response: ReportResponse) =>
    selected && (
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
    <BottomSheet open={open} onClose={onClose} snapPoints={["fit"]} initialSnap={0} showBackdrop label={title}>
      <div className={styles.sheet}>
        <h2 className={styles.title}>{title}</h2>

        <ul className={styles.list}>
          {reports.map((r) => (
            <li key={r.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.itemIcon} aria-hidden="true">
                  <Icon name="ic-warning" size={20} />
                </span>
                <span className={styles.category}>{t(`reportCategory.${r.category}`)}</span>
              </div>
              {r.equipment_label && <div className={styles.meta}>{r.equipment_label}</div>}
              <p className={styles.desc}>{r.description?.trim() || t("reportAlert.noDescription")}</p>
              <div className={styles.meta}>{t("reportAlert.reportedOn", { date: f.date(r.created_at) })}</div>
              <div className={styles.counts}>
                <span>{t("reportAlert.stillPresentCount", { count: r.still_present_count })}</span>
                <span>{t("reportAlert.resolvedCount", { count: r.resolved_count })}</span>
              </div>
            </li>
          ))}
        </ul>

        {selected && (
          <section className={styles.respond} aria-labelledby="report-respond-title">
            <div className={styles.question} id="report-respond-title">{t("reportAlert.onSite")}</div>
            {reports.length > 1 && (
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
        )}

        <button type="button" className={styles.another} onClick={onReportAnother}>
          <Icon name="ic-flag" size={14} />
          {t("reportAlert.reportAnother")}
        </button>
        <Button type="button" variant="ghost" block onClick={onClose}>
          {tc("action.close")}
        </Button>
      </div>
    </BottomSheet>
  );
}
