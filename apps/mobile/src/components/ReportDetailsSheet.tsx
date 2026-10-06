import { useTranslation } from "react-i18next";
import { BottomSheet, Button, Icon } from "@toboggo/design-system";
import type { ActiveReport } from "@toboggo/shared";
import { useFormat } from "../i18n/useFormat";
import styles from "./ReportDetailsSheet.module.css";

/**
 * Détails PUBLICS des signalements actifs d'un parc : catégorie, description,
 * date et confirmations — jamais l'auteur ni la photo (RPC `park_active_reports`).
 */
export function ReportDetailsSheet({
  open,
  onClose,
  reports,
  onReportAnother,
}: {
  open: boolean;
  onClose: () => void;
  reports: ActiveReport[];
  onReportAnother: () => void;
}) {
  const { t } = useTranslation("detail");
  const { t: tc } = useTranslation("common");
  const f = useFormat();

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={["fit"]} initialSnap={0} showBackdrop label={t("reportAlert.sheetTitle", { count: reports.length })}>
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t("reportAlert.sheetTitle", { count: reports.length })}</h2>

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
