import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { signInWithGoogle } from "@toboggo/shared";
import { Logo } from "@toboggo/design-system";
import { Illustration } from "../../illustrations";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { AppleIcon, GoogleIcon, MailIcon, PhoneIcon } from "./authIcons";
import styles from "./Splash.module.css";

/** Mail / Phone follow the brand green here (Apple / Google keep their own marks). */
const brandTint = { display: "inline-flex", color: "var(--color-primary)" } as const;

export default function Splash() {
  const navigate = useNavigate();
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const { t } = useTranslation("onboarding");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");

  useEffect(() => {
    if (userId) navigate("/map", { replace: true });
  }, [userId, navigate]);

  const comingSoon = () => showToast(tCommon("comingSoon"));

  const continueWithGoogle = async () => {
    try {
      await signInWithGoogle();
      // On success the browser redirects to Google, so nothing else runs here.
    } catch {
      showToast(tErr("auth.googleUnavailable"));
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <Logo size={44} variant="brand" />
        <h1 className={styles.headline} style={{ whiteSpace: "pre-line" }}>
          {t("splash.headline")}
        </h1>
        <p className={styles.tagline} style={{ whiteSpace: "pre-line" }}>
          {t("splash.tagline")}
        </p>
      </div>

      <div className={styles.illo}>
        <Illustration name="splashPark" />
      </div>

      <div className={styles.sheet}>
        <button type="button" className={styles.socialBtn} onClick={comingSoon}>
          <AppleIcon size={17} />
          <span>{t("splash.continueApple")}</span>
        </button>
        <button type="button" className={styles.socialBtn} onClick={continueWithGoogle}>
          <GoogleIcon size={17} />
          <span>{t("splash.continueGoogle")}</span>
        </button>
        <button type="button" className={styles.socialBtn} onClick={() => navigate("/login?mode=signup")}>
          <span style={brandTint}>
            <MailIcon size={18} />
          </span>
          <span>{t("splash.continueEmail")}</span>
        </button>

        <div className={styles.divider}>
          <span />
          <em>{t("or")}</em>
          <span />
        </div>

        <button type="button" className={styles.socialBtn} onClick={comingSoon}>
          <span style={brandTint}>
            <PhoneIcon size={17} />
          </span>
          <span>{t("splash.continuePhone")}</span>
        </button>

        <p className={styles.legal}>
          <Trans
            t={t}
            i18nKey="splash.legal"
            components={{
              terms: <span onClick={() => navigate("/legal/terms?from=onboarding")} />,
              privacy: <span onClick={() => navigate("/legal/privacy?from=onboarding")} />,
            }}
          />
        </p>

        <p className={styles.switch}>
          {t("splash.haveAccount")}
          <button type="button" onClick={() => navigate("/login-method")}>
            {t("splash.signIn")}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)" }} aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </p>
      </div>
    </div>
  );
}
