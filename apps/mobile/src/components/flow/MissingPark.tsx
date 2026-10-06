import { useTranslation } from "react-i18next";
import { BottomSheet, Button, Icon } from "@toboggo/design-system";
import styles from "./MissingPark.module.css";

/** Épingle de localisation (trait, même famille que le sprite). */
const PIN = "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z";

/** Picto « parc introuvable » : épingle + loupe, tracé local (aucune image externe). */
function PinSearch({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PIN} />
      <circle cx="12" cy="10" r="2.2" />
      <circle cx="17" cy="17.5" r="2.6" fill="var(--color-surface)" />
      <path d="m19 19.5 1.8 1.8" />
    </svg>
  );
}

/** Carte secondaire « Parc introuvable ? » — toute la carte est le bouton. */
export function MissingParkCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation("contribute");
  return (
    <button type="button" className={styles.card} onClick={onPress}>
      <span className={styles.cardIcon} aria-hidden="true">
        <PinSearch size={24} />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>{t("flow.missing.cardTitle")}</span>
        <span className={styles.cardText}>{t("flow.missing.cardText")}</span>
      </span>
      <span className={styles.chev} aria-hidden="true">
        <Icon name="ic-back" size={16} style={{ transform: "rotate(180deg)" }} />
      </span>
    </button>
  );
}

/**
 * Panneau « Votre parc n'est pas encore ici ? » : il explique, il ne soumet rien.
 * « Ajouter ce parc » ouvre un nouvel ajout (l'écran appelant gère la transition) ;
 * « Continuer à chercher » et la croix referment le panneau sans rien perdre.
 */
export function MissingParkSheet({ open, onClose, onAddPark }: { open: boolean; onClose: () => void; onAddPark: () => void }) {
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");
  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={["fit"]} initialSnap={0} showBackdrop label={t("flow.missing.title")} handleColor="color-mix(in srgb, var(--color-text) 22%, var(--color-surface))">
      <div className={styles.sheet}>
        <button type="button" className={styles.close} aria-label={tCommon("action.close")} onClick={onClose}>
          <Icon name="ic-close" size={18} />
        </button>
        <div className={styles.art} aria-hidden="true">
          <span className={styles.artCircle}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
              <path d="M3 21h11" />
              <path d="M4.5 21V11l4-3 4 3v10" />
              <path d="M7.5 21v-4h2v4" />
              <path d="M12.5 14c3 .4 5 2.6 6 5" />
              <path d="M18 3.5a3.2 3.2 0 0 1 3.2 3.2c0 2.6-3.2 5-3.2 5s-3.2-2.4-3.2-5A3.2 3.2 0 0 1 18 3.5z" />
              <circle cx="18" cy="6.7" r="1" />
            </svg>
          </span>
        </div>
        <h2 className={styles.title}>{t("flow.missing.title")}</h2>
        <p className={styles.lead}>{t("flow.missing.lead")}</p>
        <div className={styles.note}>
          <Icon name="ic-shield" size={22} style={{ color: "var(--color-primary)", flex: "0 0 auto" }} />
          <span>{t("flow.missing.verify")}</span>
        </div>
        <p className={styles.after}>{t("flow.missing.after")}</p>
        <div className={styles.actions}>
          <Button block onClick={onAddPark}>
            {t("flow.missing.add")}
          </Button>
          <Button block variant="secondary" onClick={onClose}>
            {t("flow.missing.keepSearching")}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
