import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogoMark } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import styles from "./Profile.module.css";

/**
 * "À propos de Toboggo" — écran très léger, aucun contenu inventé : logo
 * existant, tagline déjà approuvée (même valeur que onboarding.splash.tagline ;
 * dupliquée ici plutôt que lue cross-namespace, car "onboarding" n'est pas
 * précaché pour un écran du groupe profile — chargement i18n paresseux par
 * namespace, voir src/i18n/resources.ts), version réelle du build
 * (__APP_VERSION__, injectée depuis package.json par vite.config.ts — jamais
 * un numéro inventé), et un accès aux documents légaux. Refonte profil/réglages.
 */
export default function About() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");

  return (
    <div className="screen">
      <TopBar title={t("about.title")} />
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 28px", textAlign: "center" }}>
          <LogoMark size={64} />
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", lineHeight: 1.5, margin: "16px 0 4px", whiteSpace: "pre-line" }}>
            {t("about.tagline")}
          </p>
          <p style={{ fontSize: 12, color: "var(--color-text-faint)", margin: 0 }}>
            {t("about.version", { version: __APP_VERSION__ })}
          </p>
        </div>

        <div className={styles.group}>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/legal")}>
            <span>{t("privacyScreen.title")}</span>
            <Chevron />
          </button>
        </div>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)" }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
