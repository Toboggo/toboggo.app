import { useNavigate } from "react-router-dom";
import { signInWithGoogle } from "@toboggo/shared";
import { Illustration } from "../../illustrations";
import { useToastStore } from "../../lib/toast";
import { AppleIcon, ChevronLeft, ChevronRight, GoogleIcon, MailIcon, PhoneIcon } from "./authIcons";
import styles from "./LoginMethod.module.css";

export default function LoginMethod() {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);

  const continueWithGoogle = async () => {
    try {
      await signInWithGoogle();
      // On success the browser redirects to Google, so nothing else runs here.
    } catch (err: any) {
      showToast(err?.message ?? "Connexion Google indisponible pour le moment");
    }
  };

  const methods = [
    {
      key: "email",
      tile: "var(--color-primary-tint)",
      tint: "var(--color-primary)",
      icon: <MailIcon />,
      title: "Avec votre e-mail",
      subtitle: "Rapide et sécurisé",
      onClick: () => navigate("/login?mode=login"),
    },
    {
      key: "phone",
      tile: "var(--color-primary-tint)",
      tint: "var(--color-primary)",
      icon: <PhoneIcon />,
      title: "Avec votre numéro de téléphone",
      subtitle: "Recevez un code par SMS",
      onClick: () => showToast("Bientôt disponible"),
    },
    {
      key: "apple",
      tile: "var(--color-surface-alt)",
      tint: "var(--color-text)",
      icon: <AppleIcon />,
      title: "Avec Apple",
      subtitle: "Connexion en un seul geste",
      onClick: () => showToast("Bientôt disponible"),
    },
    {
      key: "google",
      tile: "var(--color-surface-alt)",
      tint: "var(--color-text)",
      icon: <GoogleIcon />,
      title: "Avec Google",
      subtitle: "Connexion en un seul geste",
      onClick: continueWithGoogle,
    },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <button type="button" className={styles.back} onClick={() => navigate("/")} aria-label="Retour">
          <ChevronLeft />
        </button>
      </div>

      <div className={styles.header}>
        <h1>Se connecter</h1>
        <p>
          Choisissez votre méthode
          <br />
          pour vous connecter à Toboggo.
        </p>
      </div>

      <div className={styles.list}>
        {methods.map((m) => (
          <button key={m.key} type="button" className={styles.card} onClick={m.onClick}>
            <span className={styles.tile} style={{ background: m.tile, color: m.tint }}>
              {m.icon}
            </span>
            <span className={styles.body}>
              <span className={styles.cardTitle}>{m.title}</span>
              <span className={styles.cardSub}>{m.subtitle}</span>
            </span>
            <ChevronRight />
          </button>
        ))}
      </div>

      <div className={styles.illo}>
        <Illustration name="parkStrip" />
      </div>
    </div>
  );
}
