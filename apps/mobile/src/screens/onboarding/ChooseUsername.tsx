import { useId, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { USERNAME_MAX, USERNAME_MIN } from "@toboggo/shared";
import { LogoMark } from "@toboggo/design-system";
import { takeResumeRoute } from "../../lib/resumeRoute";
import { useUsernameForm } from "../../lib/useUsernameForm";
import styles from "./ChooseUsername.module.css";

/** Destinations de retour qui n'ont plus de sens une fois connecté : on envoie vers la carte. */
const NON_DESTINATIONS = new Set(["/", "/login", "/login-method", "/choose-username"]);

export function afterUsernameRoute(state: unknown): string {
  const next = (state as { next?: unknown } | null)?.next;
  if (typeof next !== "string" || !next.startsWith("/")) return "/map";
  const path = next.split(/[?#]/)[0];
  return NON_DESTINATIONS.has(path) ? "/map" : next;
}

/**
 * « Choisissez votre pseudo » — étape unique après une première inscription
 * (e-mail, confirmation e-mail ou Google). Affichée par le garde de `App.tsx`
 * tant que `profiles.name_confirmed_at` est NULL ; remplace l'ancien pseudo
 * déduit de l'e-mail. Compact : le clavier ouvert laisse le champ et le bouton visibles.
 */
export default function ChooseUsername() {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const location = useLocation();
  const { value, onChange, error, saving, submit } = useUsernameForm("");
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const helpId = useId();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!(await submit())) {
      inputRef.current?.focus();
      return;
    }
    // Une contribution commencée en invité reprend là où elle s'était arrêtée.
    navigate(takeResumeRoute() ?? afterUsernameRoute(location.state), { replace: true });
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.brand}>
        <LogoMark size={56} />
        <span className={styles.wordmark}>Toboggo</span>
      </div>

      <h1 className={styles.title}>{t("username.title")}</h1>
      <span className={styles.accent} aria-hidden />
      <p className={styles.subtitle}>{t("username.subtitle")}</p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={`${styles.field} ${error ? styles.fieldError : ""}`}>
          <label htmlFor="username-input">{t("username.label")}</label>
          <input
            id="username-input"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("username.placeholder")}
            autoComplete="nickname"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={USERNAME_MAX * 2}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : helpId}
            autoFocus
          />
        </div>

        {error ? (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <p id={helpId} className={styles.help}>
            {t("username.help")} {t("username.rules", { min: USERNAME_MIN, max: USERNAME_MAX })}
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={saving} aria-busy={saving}>
          {saving && <span className={styles.spinner} aria-hidden />}
          <span>{saving ? t("username.submitting") : t("username.submit")}</span>
        </button>
      </form>

      <p className={styles.footnote}>{t("username.footnote")}</p>
    </main>
  );
}
