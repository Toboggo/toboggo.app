import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signInWithGoogle } from "@toboggo/shared";
import { Illustration } from "../../illustrations";
import { useToastStore } from "../../lib/toast";
import { AppleIcon, ChevronLeft, ChevronRight, GoogleIcon, MailIcon, PhoneIcon } from "./authIcons";
import styles from "./LoginMethod.module.css";

export default function LoginMethod() {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);
  const { t } = useTranslation("onboarding");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");

  const continueWithGoogle = async () => {
    try {
      await signInWithGoogle();
      // On success the browser redirects to Google, so nothing else runs here.
    } catch {
      showToast(tErr("auth.googleUnavailable"));
    }
  };

  const methods = [
    {
      key: "email",
      tile: "var(--color-primary-tint)",
      tint: "var(--color-primary)",
      icon: <MailIcon />,
      title: t("loginMethod.email.title"),
      subtitle: t("loginMethod.email.subtitle"),
      onClick: () => navigate("/login?mode=login"),
    },
    {
      key: "phone",
      tile: "var(--color-primary-tint)",
      tint: "var(--color-primary)",
      icon: <PhoneIcon />,
      title: t("loginMethod.phone.title"),
      subtitle: t("loginMethod.phone.subtitle"),
      onClick: () => showToast(tCommon("comingSoon")),
    },
    {
      key: "apple",
      tile: "var(--color-surface-alt)",
      tint: "var(--color-text)",
      icon: <AppleIcon />,
      title: t("loginMethod.apple.title"),
      subtitle: t("loginMethod.apple.subtitle"),
      onClick: () => showToast(tCommon("comingSoon")),
    },
    {
      key: "google",
      tile: "var(--color-surface-alt)",
      tint: "var(--color-text)",
      icon: <GoogleIcon />,
      title: t("loginMethod.google.title"),
      subtitle: t("loginMethod.google.subtitle"),
      onClick: continueWithGoogle,
    },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <button type="button" className={styles.back} onClick={() => navigate("/")} aria-label={tCommon("action.back")}>
          <ChevronLeft />
        </button>
      </div>

      <div className={styles.header}>
        <h1>{t("loginMethod.title")}</h1>
        <p style={{ whiteSpace: "pre-line" }}>{t("loginMethod.subtitle")}</p>
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
