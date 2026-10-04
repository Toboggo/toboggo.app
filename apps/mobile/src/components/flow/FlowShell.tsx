import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Icon, IconButton } from "@toboggo/design-system";
import styles from "./Flow.module.css";

/**
 * Coque commune des parcours de contribution (Ajouter un parc / des photos,
 * Donner mon avis, Signaler un problème) : en-tête compact (retour · titre ·
 * fermeture), « Étape X sur N » + progression discrète, contenu, bouton
 * principal fixe en bas (safe-area). Remonte en haut du contenu à chaque
 * changement d'étape (`stepKey`).
 */
export function FlowShell({
  title,
  step,
  total,
  stepKey,
  onBack,
  onClose,
  children,
  footer,
  stackedFooter = false,
}: {
  title: string;
  /** Index 0-based de l'étape courante, parmi les `total` étapes AFFICHÉES. */
  step: number;
  total: number;
  /** Change à chaque changement d'étape (déclenche le retour en haut). */
  stepKey: string | number;
  onBack: () => void;
  onClose: () => void;
  children: ReactNode;
  /** Bouton(s) du pied de page fixe. */
  footer: ReactNode;
  /** Pied de page à deux actions (principale + secondaire) : réserve plus de place. */
  stackedFooter?: boolean;
}) {
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");
  const stepLabel = t("flow.stepOf", { current: step + 1, total });

  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [stepKey]);

  return (
    <div className={`${styles.page} ${stackedFooter ? styles.pageTall : ""}`}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <IconButton aria-label={tCommon("action.back")} onClick={onBack}>
            <Icon name="ic-back" size={18} />
          </IconButton>
          <h1 className={styles.headerTitle}>{title}</h1>
          <IconButton aria-label={tCommon("action.close")} onClick={onClose}>
            <Icon name="ic-close" size={18} />
          </IconButton>
        </div>
        <p className={styles.stepMeta}>{stepLabel}</p>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={stepLabel}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step + 1}
        >
          <div className={styles.progressFill} style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </header>
      <main className={styles.content}>{children}</main>
      <div className={styles.footer}>
        <div className={styles.footerStack}>{footer}</div>
      </div>
    </div>
  );
}

/** Lien-bouton secondaire du pied de page (« Passer cette étape », « Non, c'est un autre parc »…). */
export function FooterSecondary({ children, onClick, outlined = false }: { children: ReactNode; onClick: () => void; outlined?: boolean }) {
  return outlined ? (
    <Button variant="secondary" block onClick={onClick}>
      {children}
    </Button>
  ) : (
    <button type="button" className={styles.ghostBtn} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * Garde de sortie : `request()` quitte tout de suite si rien n'est à perdre,
 * sinon ouvre la confirmation. `dialog` est à rendre dans l'écran.
 */
export function useLeaveGuard({
  dirty,
  onLeave,
  body,
  title,
  stay,
  leave,
}: {
  dirty: boolean;
  onLeave: () => void;
  /** Libellés propres à un parcours (ex. édition d'un avis) ; défauts génériques sinon. */
  title?: string;
  stay?: string;
  leave?: string;
  /** Ce qui arrive aux données saisies (brouillon conservé, photos perdues…). */
  body: string;
}) {
  const { t } = useTranslation("contribute");
  const [open, setOpen] = useState(false);
  const dialog = (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title={title ?? t("flow.leave.title")}
      actions={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {stay ?? t("flow.leave.stay")}
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
          >
            {leave ?? t("flow.leave.leave")}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-muted)" }}>{body}</p>
    </Dialog>
  );
  return { request: () => (dirty ? setOpen(true) : onLeave()), dialog };
}



