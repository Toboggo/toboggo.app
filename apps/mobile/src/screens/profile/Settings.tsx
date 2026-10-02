import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme, type ThemePreference } from "@toboggo/design-system";
import { useLocale } from "../../i18n/useLocale";
import { LANGUAGE_ENDONYM } from "../../i18n/languageNames";
import { useDistanceUnit, type DistanceUnitPreference } from "../../lib/distanceUnit";
import { NavRow, SettingsPage, SettingsSection, kit } from "./SettingsKit";

const APPEARANCE_LABEL_KEY: Record<ThemePreference, string> = {
  system: "settings.appearanceSystem",
  light: "settings.appearanceLight",
  dark: "settings.appearanceDark",
};

const UNIT_LABEL_KEY: Record<DistanceUnitPreference, string> = {
  auto: "settings.distanceUnitAuto",
  km: "settings.distanceUnitKm",
  mi: "settings.distanceUnitMi",
};

/**
 * Compte et réglages — préférences + compte + aide, séparés de Profile
 * (identité + famille + activité perso). Sous-écran : pas de bottom nav, retour
 * vers Profil via TopBar (défaut navigate(-1), seul point d'entrée existant).
 */
export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const { language } = useLocale();
  const [, appearance] = useTheme();
  const { preference: unitPreference } = useDistanceUnit();
  const appearanceLabel = t(APPEARANCE_LABEL_KEY[appearance], { ns: "common" });

  return (
    <SettingsPage title={t("settingsScreen.title")}>
      <SettingsSection title={t("applicationTitle")}>
        <NavRow label={t("language")} value={LANGUAGE_ENDONYM[language]} onClick={() => navigate("/language")} />
        <NavRow label={t("appearance")} value={appearanceLabel} onClick={() => navigate("/appearance")} />
        <NavRow
          label={t("settings.distanceUnitsTitle", { ns: "common" })}
          value={t(UNIT_LABEL_KEY[unitPreference], { ns: "common" })}
          onClick={() => navigate("/units")}
        />
        <NavRow label={t("notifications")} onClick={() => navigate("/notifications")} />
        <NavRow label={t("notificationsCenter")} onClick={() => navigate("/notifications/center")} />
      </SettingsSection>

      <SettingsSection title={t("accountTitle")}>
        <NavRow label={t("accountScreen.personalInfo")} onClick={() => navigate("/profile/edit")} />
        <NavRow label={t("privacyScreen.title")} onClick={() => navigate("/legal")} />
        <NavRow label={t("accountScreen.managementKicker")} onClick={() => navigate("/profile/account")} />
      </SettingsSection>

      <SettingsSection title={t("helpInfoTitle")}>
        <NavRow label={t("help")} onClick={() => navigate("/help")} />
        <NavRow label={t("contactUs")} onClick={() => navigate("/contact")} />
        <NavRow label={t("about.title")} onClick={() => navigate("/about")} />
        <NavRow label={t("privacyScreen.terms")} onClick={() => navigate("/legal/terms")} />
        <NavRow label={t("privacyScreen.privacyPolicy")} onClick={() => navigate("/legal/privacy")} />
      </SettingsSection>

      <p className={kit.version}>{t("about.version", { version: __APP_VERSION__ })}</p>
    </SettingsPage>
  );
}
