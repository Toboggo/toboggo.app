import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BottomSheet, Icon, type IconName } from "@toboggo/design-system";
import styles from "./ContributeSheet.module.css";

/**
 * Menu « Enrichir ce parc », ouvert depuis la fiche parc. Quatre actions ; chacune
 * ouvre le parcours actuel AVEC le parc déjà choisi (`?park=<id>`) : aucune
 * nouvelle sélection. Si l'utilisateur a déjà un avis publié sur ce parc, « Donner
 * mon avis » devient l'édition de cet avis (jamais un doublon). Aucun compte n'est
 * demandé ici : chaque parcours le demande à l'envoi, brouillon conservé.
 */
export function ContributeSheet({
  open,
  onClose,
  parkId,
  parkName,
  myReviewId,
}: {
  open: boolean;
  onClose: () => void;
  parkId: string;
  parkName?: string;
  /** Avis publié de l'utilisateur sur ce parc, s'il existe. */
  myReviewId?: string;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const rows: { icon: IconName; title: string; hint: string; to: string }[] = [
    { icon: "ic-list", title: t("sheet.complete"), hint: t("sheet.completeHint"), to: `/contribute/edit?park=${parkId}` },
    { icon: "ic-camera", title: t("sheet.addPhotos"), hint: t("sheet.addPhotosHint"), to: `/photo-add?park=${parkId}` },
    myReviewId
      ? { icon: "ic-review", title: t("sheet.editReview"), hint: t("sheet.editReviewHint"), to: `/review/${myReviewId}/edit` }
      : { icon: "ic-review", title: t("sheet.rate"), hint: t("sheet.rateHint"), to: `/rate?park=${parkId}` },
    { icon: "ic-warning", title: t("sheet.report"), hint: t("sheet.reportHint"), to: `/report?park=${parkId}` },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={["fit"]} initialSnap={0} showBackdrop>
      <div className={styles.head}>
        <h2 className={styles.title}>{t("sheet.title")}</h2>
        {parkName && <p className={styles.sub}>{parkName}</p>}
      </div>
      <div className={styles.list}>
        {rows.map((r) => (
          <button key={r.to} type="button" className={styles.item} onClick={() => go(r.to)}>
            <span className={styles.icon} aria-hidden="true">
              <Icon name={r.icon} size={20} />
            </span>
            <span className={styles.body}>
              <span className={styles.itemTitle}>{r.title}</span>
              <span className={styles.itemHint} style={{ display: "block" }}>{r.hint}</span>
            </span>
            <span className={styles.chev} aria-hidden="true">
              <Icon name="ic-back" size={16} style={{ transform: "rotate(180deg)" }} />
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
