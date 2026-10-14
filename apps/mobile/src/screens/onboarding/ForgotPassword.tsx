import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { sendPasswordReset } from "@toboggo/shared";
import { LogoMark } from "@toboggo/design-system";
import { classifyAuthError } from "../../lib/authErrors";
import { ChevronLeft } from "./authIcons";
import styles from "./AuthForm.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * « Mot de passe oublié » : demande d'e-mail de récupération. Aussi la cible des
 * liens refusés (`?reason=expired|invalid`) pour redemander un e-mail.
 * Le message de confirmation est volontairement neutre : il ne révèle jamais si
 * un compte existe pour l'adresse saisie.
 */
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("onboarding");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const linkProblem = params.has("reason");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError(tErr("auth.invalidEmail"));
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(trimmed);
      setEmail(trimmed);
      setSent(true);
    } catch (err) {
      const kind = classifyAuthError(err);
      setError(
        kind === "rateLimit"
          ? tErr("auth.rateLimit")
          : kind === "network"
            ? tErr("auth.network")
            : tErr("auth.resetFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/login", { replace: true });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <button type="button" className={styles.back} onClick={goBack} aria-label={tCommon("action.back")}>
          <ChevronLeft />
        </button>
      </div>

      <div className={styles.hero}>
        <div className={styles.brand}>
          <LogoMark size={72} />
          <span className={styles.wordmark}>Toboggo</span>
        </div>
        <h1>{sent ? t("auth.forgot.sentTitle") : t("auth.forgot.title")}</h1>
        {!sent && <p>{t("auth.forgot.subtitle")}</p>}
      </div>

      {sent ? (
        <div className={styles.form}>
          <p className={styles.ok} role="status">{t("auth.forgot.sent")}</p>
          <button type="button" className={styles.submit} onClick={() => setSent(false)}>
            {t("auth.forgot.fixEmail")}
          </button>
          <button type="button" className={styles.social} onClick={() => navigate("/login?mode=signup")}>
            {t("auth.forgot.createAccount")}
          </button>
          <button type="button" className={styles.guest} onClick={() => navigate("/login?mode=login", { replace: true })}>
            {t("auth.forgot.backToLogin")}
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          {linkProblem && <p className={styles.error} role="alert">{t("auth.forgot.linkInvalid")}</p>}
          <div className={`${styles.field} ${error ? styles.fieldError : ""}`}>
            <label htmlFor="forgot-email">{t("auth.emailLabel")}</label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="send"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.submit} disabled={loading} aria-busy={loading}>
            {loading && <span className={styles.spinner} />}
            <span>{loading ? t("auth.forgot.submitting") : t("auth.forgot.submit")}</span>
          </button>
          <button type="button" className={styles.guest} onClick={() => navigate("/login?mode=login", { replace: true })}>
            {t("auth.forgot.backToLogin")}
          </button>
        </form>
      )}
    </div>
  );
}
