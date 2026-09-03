import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

  useEffect(() => {
    if (userId) navigate("/map", { replace: true });
  }, [userId, navigate]);

  const comingSoon = () => showToast("Bientôt disponible");

  const continueWithGoogle = async () => {
    try {
      await signInWithGoogle();
      // On success the browser redirects to Google, so nothing else runs here.
    } catch (err: any) {
      showToast(err?.message ?? "Connexion Google indisponible pour le moment");
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <Logo size={44} variant="brand" />
        <h1 className={styles.headline}>
          Trouvez
          <br />
          le parc idéal
          <br />
          pour vos enfants
        </h1>
        <p className={styles.tagline}>
          Des milliers de parcs notés
          <br />
          par des parents comme vous.
        </p>
      </div>

      <div className={styles.illo}>
        <Illustration name="splashPark" />
      </div>

      <div className={styles.sheet}>
        <button type="button" className={styles.socialBtn} onClick={comingSoon}>
          <AppleIcon size={17} />
          <span>Continuer avec Apple</span>
        </button>
        <button type="button" className={styles.socialBtn} onClick={continueWithGoogle}>
          <GoogleIcon size={17} />
          <span>Continuer avec Google</span>
        </button>
        <button type="button" className={styles.socialBtn} onClick={() => navigate("/login?mode=signup")}>
          <span style={brandTint}>
            <MailIcon size={18} />
          </span>
          <span>Continuer avec un e-mail</span>
        </button>

        <div className={styles.divider}>
          <span />
          <em>ou</em>
          <span />
        </div>

        <button type="button" className={styles.socialBtn} onClick={comingSoon}>
          <span style={brandTint}>
            <PhoneIcon size={17} />
          </span>
          <span>Continuer avec un numéro de téléphone</span>
        </button>

        <p className={styles.legal}>
          En continuant, vous acceptez nos{" "}
          <span onClick={() => navigate("/legal/terms?from=onboarding")}>Conditions d'utilisation</span> et notre{" "}
          <span onClick={() => navigate("/legal/privacy?from=onboarding")}>Politique de confidentialité</span>.
        </p>

        <p className={styles.switch}>
          Vous avez déjà un compte ?
          <button type="button" onClick={() => navigate("/login-method")}>
            Se connecter
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)" }} aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </p>
      </div>
    </div>
  );
}
