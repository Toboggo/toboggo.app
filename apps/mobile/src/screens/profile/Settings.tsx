import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signOut, purgeDraftsForPrincipal } from "@toboggo/shared";
import { useTheme, type ThemePreference } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import { useLocale } from "../../i18n/useLocale";
import { LANGUAGE_ENDONYM } from "../../i18n/languageNames";
import styles from "./Profile.module.css";
import layoutStyles from "./Settings.module.css";

const APPEARANCE_LABEL_KEY: Record<ThemePreference, string> = {
  system: "settings.appearanceSystem",
  light: "settings.appearanceLight",
  dark: "settings.appearanceDark",
};

/**
 * Réglages — préférences + compte + aide, séparés de Profile (identité +
 * famille + activité perso). Sous-écran : pas de bottom nav, retour vers
 * Profil via TopBar (défaut navigate(-1), seul point d'entrée existant).
 */
export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const { language } = useLocale();
  const [, appearance] = useTheme();
  const appearanceLabel = t(APPEARANCE_LABEL_KEY[appearance], { ns: "common" });

  async function handleSignOut() {
    const uid = useSession.getState().userId;
    await signOut();
    if (uid) purgeDraftsForPrincipal({ userId: uid });
    navigate("/");
  }

  return (
    <div className={layoutStyles.screen}>
      <TopBar title={t("settingsScreen.title")} className={layoutStyles.topBar} />
      <div style={{ padding: "0 20px" }}>
        <h6 className={styles.kicker}>{t("applicationTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("language")} value={LANGUAGE_ENDONYM[language]} onClick={() => navigate("/language")} />
          <Row label={t("appearance")} value={appearanceLabel} onClick={() => navigate("/appearance")} />
          <Row label={t("notifications")} onClick={() => navigate("/notifications")} />
          <Row label={t("notificationsCenter")} onClick={() => navigate("/notifications/center")} />
        </div>

        <h6 className={styles.kicker}>{t("accountTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("accountScreen.personalInfo")} onClick={() => navigate("/profile/edit")} />
          <Row label={t("privacyScreen.title")} onClick={() => navigate("/legal")} />
          <Row label={t("accountScreen.managementKicker")} onClick={() => navigate("/profile/account")} />
        </div>

        <h6 className={styles.kicker}>{t("helpInfoTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("help")} onClick={() => navigate("/help")} />
          <Row label={t("contactUs")} onClick={() => navigate("/contact")} />
          <Row label={t("about.title")} onClick={() => navigate("/about")} />
          <Row label={t("privacyScreen.terms")} onClick={() => navigate("/legal/terms")} />
          <Row label={t("privacyScreen.privacyPolicy")} onClick={() => navigate("/legal/privacy")} />
        </div>

        <button type="button" className={styles.signOutBtn} onClick={handleSignOut}>
          {t("signOut")}
        </button>
        <p className={styles.versionText}>{t("about.version", { version: __APP_VERSION__ })}</p>
      </div>
    </div>
  );
}

function Row({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.groupRow} onClick={onClick}>
      <span>{label}</span>
      <span className={styles.groupRowTrailing}>
        {value && <span className={styles.groupRowValue}>{value}</span>}
        <Chevron />
      </span>
    </button>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)" }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
