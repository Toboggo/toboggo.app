import { useTranslation } from "react-i18next";
import { applyPendingUpdate, usePwaUpdateStore } from "../lib/pwa/pwaUpdate";
import styles from "./UpdateBanner.module.css";

/**
 * Bannière discrète « nouvelle version » — affichée UNIQUEMENT quand une mise
 * à jour est prête mais n'a pas été appliquée automatiquement parce que
 * l'utilisateur est en pleine saisie (voir lib/pwa/pwaUpdate.ts).
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const updateAvailable = usePwaUpdateStore((s) => s.updateAvailable);
  if (!updateAvailable) return null;
  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>{t("update.banner")}</span>
      <button type="button" className={styles.action} onClick={() => applyPendingUpdate()}>
        {t("update.action")}
      </button>
    </div>
  );
}
