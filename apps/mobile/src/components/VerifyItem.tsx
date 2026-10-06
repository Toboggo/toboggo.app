import { useTranslation } from "react-i18next";
import { Button, Icon } from "@toboggo/design-system";
import type { ParkVerification } from "@toboggo/shared";
import { useFormat } from "../i18n/useFormat";
import { useFeatureLabel } from "../lib/featureLabel";
import styles from "./VerifyItem.module.css";

/** One real, recorded park information to double-check on site: photo, name,
 * distance · city and question on top; then two equal full-width buttons and a
 * quiet « Je ne sais pas ». « Confirmer » = confirmation signal; « Modifier » =
 * the park's edit flow; « Je ne sais pas » = next verification, nothing sent. */
export function VerifyItem({
  item,
  busy,
  failed,
  onConfirm,
  onEdit,
  onSkip,
}: {
  item: ParkVerification;
  busy: boolean;
  /** The last confirmation attempt failed: the card stays and offers a retry. */
  failed: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onSkip: () => void;
}) {
  const { t, i18n } = useTranslation("contribute");
  const f = useFormat();
  const featureLabel = useFeatureLabel();
  const feature = featureLabel(item.feature.code);
  const distance = f.distance(item.park.distance_m);
  const city = item.park.city?.trim() || null;
  const available = item.status === "available";
  // Natural sentence per equipment; a code without a phrasing uses the generic wording.
  const phraseKey = `hub.verify.${available ? "has" : "lacks"}.${item.feature.code}`;
  const question = i18n.exists(`contribute:${phraseKey}`)
    ? t(available ? "hub.verify.questionHas" : "hub.verify.questionLacks", { what: t(phraseKey) })
    : t(available ? "hub.verify.questionAvailable" : "hub.verify.questionUnavailable", { feature });

  return (
    <div className={styles.item}>
      <div className={styles.top}>
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
          <p className={styles.question}>{question}</p>
          {failed && (
            <p className={styles.error} role="alert">
              {t("hub.verify.error")}
            </p>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="sm"
          loading={busy}
          disabled={busy}
          onClick={onConfirm}
          aria-label={t("hub.verify.confirmAria", { park: item.park.name, question })}
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

      <button
        type="button"
        className={styles.skip}
        disabled={busy}
        onClick={onSkip}
        aria-label={t("hub.verify.skipAria", { park: item.park.name })}
      >
        {t("hub.verify.skip")}
        <Icon name="ic-back" size={14} style={{ transform: "rotate(180deg)", flex: "none" }} />
      </button>
    </div>
  );
}
