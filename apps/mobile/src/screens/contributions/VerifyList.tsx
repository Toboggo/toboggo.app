import { useTranslation } from "react-i18next";
import { DetailHeader } from "../../components/DetailHeader";
import { VerifyItem } from "../../components/VerifyItem";
import { VerifyStateMessage, useVerifyActions } from "../../components/NearbyVerifyCard";
import styles from "./Contributions.module.css";

/** « À vérifier près de chez vous » → « Voir tout » : every real suggestion nearby. */
export default function VerifyList() {
  const { t } = useTranslation("contribute");
  const { verify, confirm, edit, skip, busyId, failedId } = useVerifyActions();

  return (
    <div className={styles.subScreen}>
      <DetailHeader title={t("hub.verify.title")} />
      <div className={styles.subBody}>
        {verify.state !== "ready" ? (
          <VerifyStateMessage
            state={verify.state}
            onRetry={verify.retry}
            onLocate={verify.locate}
            skippedAny={verify.skippedAny}
          />
        ) : (
          verify.items.map((item) => (
            <div key={`${item.park.id}:${item.feature.id}`} className={styles.subCard}>
              <VerifyItem
                item={item}
                busy={busyId === `${item.park.id}:${item.feature.id}`}
                failed={failedId === `${item.park.id}:${item.feature.id}`}
                onConfirm={() => confirm(item)}
                onEdit={() => edit(item)}
                onSkip={() => skip(item)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
