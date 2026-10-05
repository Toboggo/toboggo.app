import { useTranslation } from "react-i18next";
import { Button, Icon } from "@toboggo/design-system";
import type { ParkVerification } from "@toboggo/shared";
import { useFormat } from "../i18n/useFormat";
import { useFeatureLabel } from "../lib/featureLabel";
import styles from "./VerifyItem.module.css";

/** One real, recorded park information to double-check on site: photo on the
 * left; name, distance · city, question and the two buttons on the right.
 * « Oui, c'est bon » = confirmation signal; « Modifier » = the park's edit flow. */
export function VerifyItem({
  item,
  busy,
  failed,
  onConfirm,
  onEdit,
}: {
  item: ParkVerification;
  busy: boolean;
  /** The last confirmation attempt failed: the card stays and offers a retry. */
  failed: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation("contribute");
  const f = useFormat();
  const featureLabel = useFeatureLabel();
  const feature = featureLabel(item.feature.code);
  const distance = f.distance(item.park.distance_m);
  const city = item.park.city?.trim() || null;

  return (
    <div className={styles.item}>
      <span
        className={styles.photo}
        style={item.park.cover_photo ? { backgroundImage: `url(${item.park.cover_photo})` } : undefined}
        aria-hidden
      >
        {!item.park.cover_photo && <Icon name="ic-slide" size={28} />}
      </span>

      <div className={styles.content}>
        <span className={styles.parkName}>{item.park.name}</span>
        <span className={styles.parkMeta}>
          <Icon name="ic-explore" size={13} />
          <span>{city ? `${distance} · ${city}` : distance}</span>
        </span>
        <p className={styles.question}>
          {t(item.status === "available" ? "hub.verify.questionAvailable" : "hub.verify.questionUnavailable", {
            feature,
          })}
        </p>
        {failed && (
          <p className={styles.error} role="alert">
            {t("hub.verify.error")}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <Button
          size="sm"
          loading={busy}
          disabled={busy}
          onClick={onConfirm}
          aria-label={t("hub.verify.confirmAria", { feature, park: item.park.name })}
        >
          {!busy && <Icon name="ic-check" size={16} />}
          {failed ? t("hub.verify.retry") : t("hub.verify.yes")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={onEdit}
          aria-label={t("hub.verify.editAria", { park: item.park.name })}
        >
          <Icon name="ic-pencil" size={16} />
          {t("hub.verify.edit")}
        </Button>
      </div>
    </div>
  );
}
