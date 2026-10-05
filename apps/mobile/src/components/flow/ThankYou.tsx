import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Icon, LogoMark } from "@toboggo/design-system";
import styles from "./ThankYou.module.css";

/**
 * Page de remerciement commune aux contributions (ajout de parc, complétion,
 * photos, avis / édition, signalement). À afficher UNIQUEMENT après un succès
 * confirmé : le wizard est alors démonté (jamais de formulaire derrière).
 *
 * Le message de statut est fourni par l'appelant : il dit ce qui se passe
 * réellement (publié tout de suite, ou en attente de vérification) — la mention
 * de vérification (`moderation`) n'est affichée que lorsqu'elle s'applique.
 * Illustration locale légère, animée une seule fois (≈1,6 s) hors
 * `prefers-reduced-motion`.
 */
export function ThankYou({
  body,
  moderation,
  parkId,
}: {
  /** Confirmation adaptée à l'action. */
  body: ReactNode;
  /** Phrase de vérification, seulement si la contribution est en attente. */
  moderation?: ReactNode;
  /** Fiche accessible → « Revenir au parc » ; sinon retour carte. */
  parkId?: string | null;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  return (
    <main className={styles.page}>
      <div className={styles.logo}>
        <LogoMark size={44} />
      </div>
      <svg className={styles.art} viewBox="0 0 240 170" role="presentation" aria-hidden="true" focusable="false">
        <circle className={styles.sun} cx="168" cy="52" r="22" fill="var(--color-accent)" />
        <g className={styles.spark} fill="var(--color-accent)">
          <rect x="132" y="14" width="5" height="14" rx="2.5" transform="rotate(-30 134 21)" />
        </g>
        <g className={styles.spark} fill="var(--color-accent)">
          <rect x="196" y="20" width="5" height="14" rx="2.5" transform="rotate(30 198 27)" />
        </g>
        <g className={styles.spark} fill="var(--color-accent)">
          <rect x="206" y="62" width="14" height="5" rx="2.5" />
        </g>
        <g className={styles.tower}>
          <path d="M70 78l30-22 30 22v10H70z" fill="var(--color-primary)" />
          <rect x="76" y="88" width="8" height="64" rx="2" fill="var(--color-primary)" />
          <rect x="116" y="88" width="8" height="64" rx="2" fill="var(--color-primary)" />
          <rect x="76" y="108" width="48" height="6" rx="2" fill="var(--color-primary)" />
          <rect x="76" y="130" width="48" height="6" rx="2" fill="var(--color-primary)" />
          <path d="M60 152h110" stroke="var(--color-primary)" strokeWidth="6" strokeLinecap="round" />
        </g>
        <path
          className={styles.slide}
          d="M128 98c24 2 40 18 58 50"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="14"
          strokeLinecap="round"
        />
      </svg>
      <div className={styles.text}>
        <h1 className={styles.title}>{t("thanks.title")}</h1>
        <p className={styles.body}>{body}</p>
        {moderation && (
          <p className={styles.note} style={{ margin: "16px auto 0" }}>
            <Icon name="ic-shield" size={16} />
            <span>{moderation}</span>
          </p>
        )}
      </div>
      <div className={styles.actions}>
        {parkId ? (
          <Button block onClick={() => navigate(`/park/${parkId}`, { replace: true })}>
            {t("thanks.backToPark")}
          </Button>
        ) : (
          <Button block onClick={() => navigate("/map", { replace: true })}>
            {t("common.backToMap")}
          </Button>
        )}
        <button type="button" className={styles.link} onClick={() => navigate("/contributions", { replace: true })}>
          {t("thanks.seeMyContributions")}
        </button>
      </div>
    </main>
  );
}
