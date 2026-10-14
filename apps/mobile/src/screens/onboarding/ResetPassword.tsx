import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signOut, signOutLocal, updatePassword } from "@toboggo/shared";
import { LogoMark } from "@toboggo/design-system";
import { classifyAuthError } from "../../lib/authErrors";
import { MIN_PASSWORD_LENGTH } from "../../lib/passwordPolicy";
import { useSession } from "../../lib/session";
import { EyeIcon } from "./authIcons";
import styles from "./AuthForm.module.css";

type Phase = "form" | "saving" | "signoutFailed";

/**
 * « Nouveau mot de passe » : atteint via le lien e-mail de récupération. La
 * session créée par le lien est purement technique (`recovery`) : après
 * enregistrement on la ferme, puis retour à « Se connecter ».
 */
export default function ResetPassword() {
  const recovery = useSession((s) => s.recovery);
  const email = useSession((s) => s.profile?.email ?? null);
  const endRecovery = useSession((s) => s.endRecovery);
  const navigate = useNavigate();
  const { t } = useTranslation("onboarding");
  const { t: tErr } = useTranslation("errors");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  // Posé avant la fermeture de session : l'événement SIGNED_OUT remet `recovery`
  // à false, ce qui ne doit pas être pris pour un lien invalide.
  const finishing = useRef(false);

  if (!recovery && !finishing.current) {
    return <Navigate to="/forgot-password?reason=invalid" replace />;
  }

  function finish() {
    navigate("/login?mode=login", { replace: true, state: { passwordChanged: true } });
    endRecovery();
  }

  async function closeSession(): Promise<boolean> {
    try {
      await signOut();
      return true;
    } catch {
      return false;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.reset.tooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.reset.mismatch"));
      return;
    }
    setPhase("saving");
    try {
      await updatePassword(password);
    } catch (err) {
      const kind = classifyAuthError(err);
      if (kind === "sessionLost") {
        navigate("/forgot-password?reason=invalid", { replace: true });
        endRecovery();
        return;
      }
      setError(
        kind === "samePassword"
          ? t("auth.reset.samePassword")
          : kind === "weakPassword"
            ? tErr("auth.weakPassword")
            : kind === "network"
              ? tErr("auth.network")
              : kind === "rateLimit"
                ? tErr("auth.rateLimit")
                : tErr("auth.generic"),
      );
      setPhase("form");
      return;
    }
    // Mot de passe enregistré : on ne le garde plus en mémoire.
    setPassword("");
    setConfirm("");
    finishing.current = true;
    if (await closeSession()) finish();
    else setPhase("signoutFailed");
  }

  async function retrySignOut() {
    setPhase("saving");
    if (await closeSession()) finish();
    else setPhase("signoutFailed");
  }

  // Dernier recours si le serveur est injoignable : on purge au moins la session de cet appareil.
  async function continueToLogin() {
    try {
      await signOutLocal();
    } catch {
      /* stockage local inaccessible : on avance quand même, le mot de passe est déjà changé */
    }
    finish();
  }

  async function cancel() {
    finishing.current = true;
    await closeSession().then((ok) => (ok ? undefined : signOutLocal().catch(() => undefined)));
    navigate("/login?mode=login", { replace: true });
    endRecovery();
  }

  const saving = phase === "saving";

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div className={styles.brand}>
          <LogoMark size={72} />
          <span className={styles.wordmark}>Toboggo</span>
        </div>
        <h1>{t("auth.reset.title")}</h1>
        <p>{email ? t("auth.reset.subtitle", { email }) : t("auth.reset.subtitleNoEmail")}</p>
      </div>

      {phase === "signoutFailed" ? (
        <div className={styles.form}>
          <p className={styles.error} role="alert">{t("auth.reset.signOutFailed")}</p>
          <button type="button" className={styles.submit} onClick={retrySignOut}>
            {t("auth.reset.retrySignOut")}
          </button>
          <button type="button" className={styles.guest} onClick={continueToLogin}>
            {t("auth.reset.continueToLogin")}
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <div className={`${styles.field} ${error ? styles.fieldError : ""}`}>
            <label htmlFor="reset-pwd">{t("auth.reset.newPassword")}</label>
            <input
              id="reset-pwd"
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              enterKeyHint="next"
              aria-describedby="reset-pwd-hint"
              placeholder={t("auth.passwordPlaceholderSignup", { min: MIN_PASSWORD_LENGTH })}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className={styles.eye} onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? t("auth.hidePassword") : t("auth.showPassword")} aria-pressed={showPwd}>
              <EyeIcon />
            </button>
          </div>
          <p id="reset-pwd-hint" className={styles.hint}>{t("auth.passwordRules", { min: MIN_PASSWORD_LENGTH })}</p>

          <div className={`${styles.field} ${error ? styles.fieldError : ""}`}>
            <label htmlFor="reset-confirm">{t("auth.reset.confirmPassword")}</label>
            <input
              id="reset-confirm"
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              enterKeyHint="go"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button type="submit" className={styles.submit} disabled={saving} aria-busy={saving}>
            {saving && <span className={styles.spinner} />}
            <span>{saving ? t("auth.reset.submitting") : t("auth.reset.submit")}</span>
          </button>
          <button type="button" className={styles.guest} onClick={cancel} disabled={saving}>
            {t("auth.reset.cancel")}
          </button>
        </form>
      )}
    </div>
  );
}
