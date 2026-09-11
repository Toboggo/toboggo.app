import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signIn, signUp, sendPasswordReset, signInWithGoogle } from "@toboggo/shared";
import { Logo } from "@toboggo/design-system";
import { useToastStore } from "../../lib/toast";
import { takeResumeRoute } from "../../lib/resumeRoute";
import { AppleIcon, ChevronLeft, EyeIcon, GoogleIcon } from "./authIcons";
import styles from "./AuthForm.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (!EMAIL_RE.test(email) || password.length < 6) {
      setError(tErr("auth.invalidForm"));
      return;
    }
    setLoading(true);
    try {
      if (isSignup) {
        const res = await signUp(email, password, email.split("@")[0]);
        showToast(t("auth.accountCreated"));
        // Only jump straight to a pending contribution when a session was issued
        // right away (email confirmation disabled); otherwise the draft waits.
        const resumeRoute = res.session ? takeResumeRoute() : null;
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
    await sendPasswordReset(email);
    setResetSent(true);
  }

  const continueWithGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch {
      showToast(tErr("auth.googleUnavailable"));
    }
  };

  const inputStyle = { borderColor: error ? "var(--color-error)" : "var(--color-border)" };

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label={tCommon("action.back")}>
        <ChevronLeft />
      </button>

      <div className={styles.hero}>
        <Logo size={30} variant="brand" />
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="auth-email">{t("auth.emailLabel")}</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="auth-pwd">{t("auth.passwordLabel")}</label>
          <div className={styles.pwdWrap}>
            <input
              id="auth-pwd"
              type={showPwd ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? t("auth.passwordPlaceholderSignup") : t("auth.passwordPlaceholderLogin")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="button" className={styles.eye} onClick={() => setShowPwd((v) => !v)} aria-label={t("auth.showPassword")}>
              <EyeIcon />
            </button>
          </div>
          {!isSignup && (
            <p className={styles.forgot}>
              <span onClick={forgotPassword}>{t("auth.forgotPassword")}</span>
            </p>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {resetSent && (
          <p className={styles.ok}>{t("auth.resetSent", { email })}</p>
        )}

        <button type="submit" className={styles.submit} disabled={loading} style={{ opacity: loading ? 0.85 : 1 }}>
          {loading && <span className={styles.spinner} />}
          <span>{submitLabel}</span>
        </button>

        <div className={styles.divider}>
          <span />
          <em>{t("or")}</em>
          <span />
        </div>

        <button type="button" className={styles.social} onClick={continueWithGoogle}>
          <GoogleIcon size={17} />
          <span>{t("auth.continueGoogle")}</span>
        </button>
        <button type="button" className={styles.social} onClick={() => showToast(tCommon("comingSoon"))}>
          <AppleIcon size={16} />
          <span>{t("auth.continueApple")}</span>
        </button>

        <p className={styles.switch}>
          {isSignup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
          <span onClick={() => (setMode(isSignup ? "login" : "signup"), setError(null))}>
            {isSignup ? t("auth.switchToLogin") : t("auth.switchToSignup")}
          </span>
        </p>
      </form>
    </div>
  );
}
