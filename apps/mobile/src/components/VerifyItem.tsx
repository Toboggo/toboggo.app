import { useTranslation } from "react-i18next";
import { Button, Icon } from "@toboggo/design-system";
import type { ParkVerification } from "@toboggo/shared";
import { useFormat } from "../i18n/useFormat";
import { useFeatureLabel } from "../lib/featureLabel";
import styles from "./VerifyItem.module.css";

/** One real, recorded park information to double-check on site. « Oui, c'est
 * bon » = confirmation signal; « Modifier » = the park's edit flow. */
export function VerifyItem({
  item,
  busy,
  onConfirm,
  onEdit,
}: {
  item: ParkVerification;
  busy: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation("contribute");
  const f = useFormat();
  const featureLabel = useFeatureLabel();
  const feature = featureLabel(item.feature.code);
  const place = [f.distance(item.park.distance_m), item.park.city].filter(Boolean).join(" · ");

  return (
    <div className={styles.item}>
      <div className={styles.parkRow}>
        <span
          className={styles.photo}
          style={item.park.cover_photo ? { backgroundImage: `url(${item.park.cover_photo})` } : undefined}
          aria-hidden
        >
          {!item.park.cover_photo && <Icon name="ic-explore" size={22} />}
        </span>
        <span className={styles.parkBody}>
          <span className={styles.parkName}>{item.park.name}</span>
          <span className={styles.parkMeta}>{place}</span>
        </span>
      </div>

      <p className={styles.question}>
        {t(item.status === "available" ? "hub.verify.questionAvailable" : "hub.verify.questionUnavailable", {
          feature,
        })}
      </p>

      <div className={styles.actions}>
        <Button
          size="sm"
          loading={busy}
          onClick={onConfirm}
          aria-label={t("hub.verify.confirmAria", { feature, park: item.park.name })}
        >
          {t("hub.verify.yes")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={onEdit}
          aria-label={t("hub.verify.editAria", { park: item.park.name })}
        >
          {t("hub.verify.edit")}
        </Button>
      </div>
    </div>
  );
}
