import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getSession, onPasswordRecovery, updatePassword, wasPasswordRecoveryDetected } from "@toboggo/shared";
import { Logo } from "@toboggo/design-system";
import { useSession } from "../../lib/session";
import { EyeIcon } from "./authIcons";
import styles from "./AuthForm.module.css";

type Status = "checking" | "ready" | "saving" | "done" | "invalid";

/**
 * Step C/D of the password recovery flow (see `packages/shared/src/api/auth.ts`
 * for steps A/B). Reached by React Router matching `/reset-password` directly
 * (the normal path, via `sendPasswordReset`'s `redirectTo`) or via `App.tsx`'s
 * `onPasswordRecovery` fallback navigation.
 *
 * Validity isn't decided by the route alone, nor by merely having a session:
 * a recovery link can be expired or already used, and — importantly — this URL
 * could be opened by a user who is simply already logged in for an unrelated
 * reason (bookmark, shared device). Being logged in is not proof of a genuine
 * recovery link, so `getSession()` alone is not the gate.
 *
 * `wasPasswordRecoveryDetected()` — read once, synchronously, on mount — is
 * the actual gate; the live `onPasswordRecovery` subscription below only
 * covers a recovery that completes *after* this component is already
 * mounted. Read that function's doc comment for why the flag is what this
 * screen must rely on: this component cannot reliably observe the live event
 * itself, verified by tracing a real recovery link end to end (Supabase +
 * Mailpit) with temporary logging — a first version that awaited
 * `getSession()` and only ever listened live reliably reached `invalid` for
 * a genuine recovery link, not `ready`.
 */
export default function ResetPassword() {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const userId = useSession((s) => s.userId);
  const { t } = useTranslation("onboarding");
  const { t: tErr } = useTranslation("errors");

  useEffect(() => {
    let cancelled = false;
    let recovery = wasPasswordRecoveryDetected();

    const unsubscribe = onPasswordRecovery(() => {
      recovery = true;
      if (!cancelled) setStatus("ready");
    });

    if (recovery) {
      setStatus("ready");
    } else {
      getSession()
        .then((session) => {
          if (!cancelled) setStatus(session && recovery ? "ready" : "invalid");
        })
        .catch(() => {
          if (!cancelled) setStatus("invalid");
        });
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(tErr("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(tErr("auth.passwordMismatch"));
      return;
    }
    setStatus("saving");
    try {
      await updatePassword(password);
      setStatus("done");
    } catch {
      setError(tErr("auth.resetFailed"));
      setStatus("ready");
    }
  }

  const inputStyle = { borderColor: error ? "var(--color-error)" : "var(--color-border)" };

  if (status === "checking") {
    // Resolves synchronously to "ready" when wasPasswordRecoveryDetected()
    // is already true on mount (the normal case — see the effect above);
    // otherwise resolves once getSession() settles, normally a few
    // milliseconds. No spinner chrome for what's normally an imperceptible
    // wait.
    return <div className={styles.wrap} />;
  }

  if (status === "invalid") {
    return (
      <div className={styles.wrap}>
        <div className={styles.hero}>
          <Logo size={30} variant="brand" />
          <div>
            <h1>{t("auth.resetPassword.invalidTitle")}</h1>
            <p>{t("auth.resetPassword.invalidDescription")}</p>
          </div>
        </div>
        <button type="button" className={styles.submit} onClick={() => navigate("/login", { replace: true })}>
          <span>{t("auth.resetPassword.backToLogin")}</span>
        </button>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className={styles.wrap}>
        <div className={styles.hero}>
          <Logo size={30} variant="brand" />
          <div>
            <h1>{t("auth.resetPassword.successTitle")}</h1>
            <p>{t("auth.resetPassword.successDescription")}</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.submit}
          onClick={() => navigate(userId ? "/map" : "/login", { replace: true })}
        >
          <span>{t("auth.resetPassword.continueCta")}</span>
        </button>
      </div>
    );
  }

  const saving = status === "saving";

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <Logo size={30} variant="brand" />
        <div>
          <h1>{t("auth.resetPassword.title")}</h1>
          <p>{t("auth.resetPassword.description")}</p>
        </div>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="reset-pwd">{t("auth.resetPassword.newPasswordLabel")}</label>
          <div className={styles.pwdWrap}>
            <input
              id="reset-pwd"
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              placeholder={t("auth.resetPassword.newPasswordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="button" className={styles.eye} onClick={() => setShowPwd((v) => !v)} aria-label={t("auth.showPassword")}>
              <EyeIcon />
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="reset-pwd-confirm">{t("auth.resetPassword.confirmLabel")}</label>
          <input
            id="reset-pwd-confirm"
            type={showPwd ? "text" : "password"}
            autoComplete="new-password"
            placeholder={t("auth.resetPassword.confirmPlaceholder")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit} disabled={saving} style={{ opacity: saving ? 0.85 : 1 }}>
          {saving && <span className={styles.spinner} />}
          <span>{saving ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}</span>
        </button>
      </form>
    </div>
  );
}
