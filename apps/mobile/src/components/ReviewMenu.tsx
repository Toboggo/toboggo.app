import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet, IconButton } from "@toboggo/design-system";
import styles from "./QuickMenu.module.css";

/**
 * « ⋯ » d'un avis dont l'utilisateur est l'auteur : ouvre une feuille d'actions
 * (aujourd'hui une seule : « Modifier mon avis »). Partagé par la fiche du parc
 * (« Votre avis ») et Contributions, pour que les deux parcours restent alignés.
 */
export function ReviewMenu({ onEdit, className }: { onEdit: () => void; className?: string }) {
  const { t } = useTranslation("contribute");
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton aria-label={t("review.menuLabel")} aria-haspopup="menu" className={className} onClick={() => setOpen(true)}>
        {/* Pas de pictogramme « plus » dans le sprite : trois points inline, sans nouvelle icône. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </IconButton>
      <BottomSheet open={open} onClose={() => setOpen(false)} snapPoints={["fit"]} initialSnap={0} showBackdrop>
        <div className={styles.menu}>
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <span className={styles.icon}>✏️</span>
            {t("review.edit.menu")}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
