import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Icon, IconButton } from "@toboggo/design-system";
import styles from "./ReviewMenu.module.css";

/**
 * « ⋯ » d'un avis dont l'utilisateur est l'auteur : ouvre un panneau d'actions
 * en bas d'écran (aujourd'hui une seule : « Modifier mon avis »). Partagé par la
 * fiche du parc (« Votre avis ») et « Mes ajouts », pour que les deux restent
 * alignés. Fermeture : « Annuler », toucher extérieur, Échap ; le défilement de
 * l'arrière-plan est bloqué et le focus rendu au « ⋯ » à la fermeture.
 */
export function ReviewMenu({ onEdit, parkName, className }: { onEdit: () => void; parkName?: string | null; className?: string }) {
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Le « ⋯ » vient d'être touché : c'est lui qui récupère le focus à la fermeture.
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      // Focus piégé dans le panneau tant qu'il est ouvert.
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
      if (!items.length) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <IconButton aria-label={t("review.menuLabel")} aria-haspopup="dialog" aria-expanded={open} className={className} onClick={() => setOpen(true)}>
        {/* Pas de pictogramme « plus » dans le sprite : trois points inline, sans nouvelle icône. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </IconButton>
      {open &&
        createPortal(
          <>
            <div className={styles.backdrop} onClick={() => setOpen(false)} data-testid="review-menu-backdrop" />
            <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <div className={styles.head}>
                <h2 id={titleId} className={styles.title}>
                  {t("review.menu.title")}
                </h2>
                {parkName && <p className={styles.subtitle}>{parkName}</p>}
              </div>
              <button
                type="button"
                className={styles.row}
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                <Icon name="ic-pencil" size={20} />
                <span className={styles.label}>{t("review.edit.menu")}</span>
                <Icon name="ic-back" size={16} style={{ color: "var(--color-text-faint)", transform: "rotate(180deg)" }} />
              </button>
              <button type="button" className={styles.cancel} onClick={() => setOpen(false)}>
                {tCommon("action.cancel")}
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
