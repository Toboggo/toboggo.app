import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Logo } from "@toboggo/design-system";
import { useSession } from "../../lib/session";
import { hasSeenWelcome, markWelcomeSeen } from "../../lib/welcomeSeen";
import styles from "./Splash.module.css";

export default function Splash() {
  const navigate = useNavigate();
  const userId = useSession((s) => s.userId);
  const { t } = useTranslation("onboarding");

  // Déjà connecté, ou accueil déjà franchi sur cet appareil : on ne le réimpose pas.
  const skip = Boolean(userId) || hasSeenWelcome();
  useEffect(() => {
    if (skip) navigate("/map", { replace: true });
  }, [skip, navigate]);
  if (skip) return null;

  const explore = () => {
    markWelcomeSeen();
    navigate("/map");
  };

  return (
    <div className={styles.wrap}>
      <img className={styles.photo} src="/images/welcome-park.webp" alt="" />
      <div className={styles.scrim} />

      <div className={styles.content}>
        <div className={styles.logo}>
          <Logo size={44} variant="mono" tone="light" />
        </div>

        <div className={styles.copy}>
          <h1>{t("splash.headline")}</h1>
          <p>{t("splash.tagline")}</p>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={explore}>
            {t("splash.explore")}
          </button>
          <button type="button" className={styles.secondary} onClick={() => navigate("/login?mode=signup")}>
            {t("splash.createAccount")}
          </button>
          <p className={styles.switch}>
            {t("splash.haveAccount")}{" "}
            <button type="button" onClick={() => navigate("/login?mode=login")}>
              {t("splash.signIn")}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
