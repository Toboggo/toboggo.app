import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signIn, signUp, sendPasswordReset } from "@toboggo/shared";
import { LogoMark } from "@toboggo/design-system";
import { useToastStore } from "../../lib/toast";
import { takeResumeRoute } from "../../lib/resumeRoute";
import { trackEvent } from "../../lib/analytics";
import { markWelcomeSeen } from "../../lib/welcomeSeen";
import { clearGoogleLoginMarker, startGoogleLogin } from "../../lib/googleLogin";
import { ChevronLeft, EyeIcon, GoogleIcon } from "./authIcons";
import styles from "./AuthForm.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Règle réelle : minimum Supabase (`minimum_password_length`), aucune autre exigence. */
const MIN_PASSWORD_LENGTH = 6;

export default function AuthForm() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation("onboarding");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const showToast = useToastStore((s) => s.show);

  const isSignup = mode === "signup";
  const title = isSignup ? t("auth.signupTitle") : t("auth.loginTitle");
  const subtitle = isSignup ? t("auth.signupSubtitle") : t("auth.loginSubtitle");
  const submitLabel = loading
    ? isSignup
      ? t("auth.signupSubmitting")
      : t("auth.loginSubmitting")
    : isSignup
      ? t("auth.signupSubmit")
      : t("auth.loginSubmit");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email) || password.length < MIN_PASSWORD_LENGTH) {
      setError(tErr("auth.invalidForm"));
      return;
    }
    setLoading(true);
    // Un login email volontaire annule tout marqueur Google resté d'un essai
    // abandonné — sinon sa session serait comptée comme un login Google.
    clearGoogleLoginMarker();
    try {
      if (isSignup) {
        const res = await signUp(email, password);
        showToast(t("auth.accountCreated"));
        // Only jump straight to a pending contribution when a session was issued
        // right away (email confirmation disabled); otherwise the draft waits.
        const resumeRoute = res.session ? takeResumeRoute() : null;
        // `takeResumeRoute()` est déjà consommé ci-dessus (lecture one-shot) —
        // on réutilise sa valeur, on ne le rappelle jamais une 2e fois.
        trackEvent("signup_completed", {
          provider: "email",
          entry_point: resumeRoute ? "contribution_resume" : "splash",
        });
        if (resumeRoute) {
          // Reprise d'une contribution après login juste-à-temps : on REMPLACE
          // l'entrée /login. Une fois la contribution finie (confirmation
          // autonome → "Voir le parc"), un Retour depuis la fiche parc ne doit
          // ramener ni dans le wizard déjà soumis ni sur cet écran de connexion.
          // Même logique que la reprise OAuth (App.tsx). Le fallback ci-dessous
          // reste en push : /permissions est une vraie destination d'onboarding.
          navigate(resumeRoute, { replace: true });
        } else {
          navigate("/permissions");
        }
      } else {
        await signIn(email, password);
        trackEvent("login_completed", { provider: "email" });
        // Resume an in-progress contribution if one was started before login.
        const resumeRoute = takeResumeRoute();
        if (resumeRoute) {
          // Reprise : on remplace /login (cf. commentaire branche signup).
          navigate(resumeRoute, { replace: true });
        } else {
          // Login standard : /map en push, comportement d'onboarding inchangé.
          navigate("/map");
        }
      }
    } catch (err: any) {
      setError(
        err?.message === "Invalid login credentials"
          ? tErr("auth.invalidCredentials")
          : tErr("auth.generic"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    if (!EMAIL_RE.test(email)) {
      setError(tErr("auth.emailForReset"));
      return;
    }
    try {
      await sendPasswordReset(email);
      setError(null);
      setResetSent(true);
    } catch {
      setError(tErr("auth.generic"));
    }
  }

  const continueWithGoogle = async () => {
    try {
      await startGoogleLogin();
    } catch {
      showToast(tErr("auth.googleUnavailable"));
    }
  };

  const goBack = () => {
    // Pas d'historique (ouverture directe de /login) : retour à l'accueil.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/");
  };

  const continueAsGuest = () => {
    markWelcomeSeen();
    navigate("/map");
  };

  const toggleMode = () => {
    setMode(isSignup ? "login" : "signup");
    setError(null);
    setResetSent(false);
  };

  const fieldClass = `${styles.field} ${error ? styles.fieldError : ""}`;

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <button type="button" className={styles.back} onClick={goBack} aria-label={tCommon("action.back")}>
          <ChevronLeft />
        </button>
        <p className={styles.topSwitch}>
          {isSignup ? t("auth.topHaveAccount") : t("auth.topNoAccount")}{" "}
          <button type="button" onClick={toggleMode}>
            {isSignup ? t("auth.switchToLogin") : t("auth.switchToSignup")}
          </button>
        </p>
      </div>

      <div className={styles.hero}>
        <div className={styles.brand}>
          <LogoMark size={72} />
          <span className={styles.wordmark}>Toboggo</span>
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={fieldClass}>
          <label htmlFor="auth-email">{t("auth.emailLabel")}</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="next"
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <div className={fieldClass}>
            <label htmlFor="auth-pwd">{t("auth.passwordLabel")}</label>
            <input
              id="auth-pwd"
              type={showPwd ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              enterKeyHint="go"
              aria-describedby={isSignup ? "auth-pwd-hint" : undefined}
              placeholder={isSignup ? t("auth.passwordPlaceholderSignup", { min: MIN_PASSWORD_LENGTH }) : t("auth.passwordPlaceholderLogin")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className={styles.eye} onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? t("auth.hidePassword") : t("auth.showPassword")} aria-pressed={showPwd}>
              <EyeIcon />
            </button>
          </div>
          {isSignup ? (
            <p id="auth-pwd-hint" className={styles.hint}>
              {t("auth.passwordRules", { min: MIN_PASSWORD_LENGTH })}
            </p>
          ) : (
            <p className={styles.forgot}>
              <button type="button" onClick={forgotPassword}>
                {t("auth.forgotPassword")}
              </button>
            </p>
          )}
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {resetSent && (
          <p className={styles.ok} role="status">{t("auth.resetSent", { email })}</p>
        )}

        <button type="submit" className={styles.submit} disabled={loading} aria-busy={loading}>
          {loading && <span className={styles.spinner} />}
          <span>{submitLabel}</span>
        </button>

        <div className={styles.divider}>
          <span />
          <em>{t("or")}</em>
          <span />
        </div>

        <button type="button" className={styles.social} onClick={continueWithGoogle}>
          <GoogleIcon size={20} />
          <span>{t("auth.continueGoogle")}</span>
        </button>
      </form>

      {isSignup ? (
        <p className={styles.legal}>
          <button type="button" onClick={() => navigate("/legal/terms?from=onboarding")}>{t("auth.legalTerms")}</button>
          <span aria-hidden> · </span>
          <button type="button" onClick={() => navigate("/legal/privacy?from=onboarding")}>{t("auth.legalPrivacy")}</button>
        </p>
      ) : (
        <button type="button" className={styles.guest} onClick={continueAsGuest}>
          {t("auth.continueAsGuest")}
        </button>
      )}
    </div>
  );
}
