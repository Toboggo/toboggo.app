import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { signIn, signUp, sendPasswordReset, signInWithGoogle } from "@toboggo/shared";
import { Logo } from "@toboggo/design-system";
import { useToastStore } from "../../lib/toast";
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
  const showToast = useToastStore((s) => s.show);

  const isSignup = mode === "signup";
  const title = isSignup ? "Créer un compte" : "Bon retour !";
  const subtitle = isSignup
    ? "Créez votre compte pour sauvegarder vos parcs favoris."
    : "Connectez-vous à votre compte.";
  const submitLabel = loading
    ? isSignup
      ? "Création..."
      : "Connexion..."
    : isSignup
      ? "CRÉER UN COMPTE"
      : "SE CONNECTER";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email) || password.length < 6) {
      setError("Entrez une adresse e-mail et un mot de passe valides (6 caractères min).");
      return;
    }
    setLoading(true);
    try {
      if (isSignup) {
        await signUp(email, password, email.split("@")[0]);
        showToast("Compte créé — vérifiez vos e-mails pour confirmer.");
        navigate("/permissions");
      } else {
        await signIn(email, password);
        navigate("/map");
      }
    } catch (err: any) {
      setError(
        err.message === "Invalid login credentials"
          ? "Adresse e-mail ou mot de passe incorrect."
          : err.message,
      );
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    if (!EMAIL_RE.test(email)) {
      setError("Entrez votre e-mail pour recevoir le lien");
      return;
    }
    await sendPasswordReset(email);
    setResetSent(true);
  }

  const continueWithGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      showToast(err?.message ?? "Connexion Google indisponible pour le moment");
    }
  };

  const inputStyle = { borderColor: error ? "var(--color-error)" : "var(--color-border)" };

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label="Retour">
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
          <label htmlFor="auth-email">E-mail</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="exemple@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="auth-pwd">Mot de passe</label>
          <div className={styles.pwdWrap}>
            <input
              id="auth-pwd"
              type={showPwd ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "Choisissez un mot de passe" : "Votre mot de passe"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="button" className={styles.eye} onClick={() => setShowPwd((v) => !v)} aria-label="Afficher le mot de passe">
              <EyeIcon />
            </button>
          </div>
          {!isSignup && (
            <p className={styles.forgot}>
              <span onClick={forgotPassword}>Mot de passe oublié ?</span>
            </p>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {resetSent && (
          <p className={styles.ok}>Lien de réinitialisation envoyé à {email}. Consultez votre boîte mail.</p>
        )}

        <button type="submit" className={styles.submit} disabled={loading} style={{ opacity: loading ? 0.85 : 1 }}>
          {loading && <span className={styles.spinner} />}
          <span>{submitLabel}</span>
        </button>

        <div className={styles.divider}>
          <span />
          <em>ou</em>
          <span />
        </div>

        <button type="button" className={styles.social} onClick={continueWithGoogle}>
          <GoogleIcon size={17} />
          <span>Continuer avec Google</span>
        </button>
        <button type="button" className={styles.social} onClick={() => showToast("Bientôt disponible")}>
          <AppleIcon size={16} />
          <span>Continuer avec Apple</span>
        </button>

        <p className={styles.switch}>
          {isSignup ? "Vous avez déjà un compte ?" : "Pas encore de compte ?"}{" "}
          <span onClick={() => (setMode(isSignup ? "login" : "signup"), setError(null))}>
            {isSignup ? "Se connecter" : "Créer un compte"}
          </span>
        </p>
      </form>
    </div>
  );
}
