import { useTranslation } from "react-i18next";
import { LANGUAGE_OPTIONS } from "../../i18n/languageNames";
import { useLocale } from "../../i18n/useLocale";
import { ChoiceList, SettingsPage, kit } from "./SettingsKit";

/**
 * Choix de la langue — écran dédié, indépendant du compte (invité comme
 * connecté). Extrait de l'ancien Display.tsx (refonte profil/réglages) pour
 * que "Langue" soit atteignable en un tap depuis le Profil au lieu d'être
 * noyée dans un écran mixte avec l'apparence.
 */
export default function Language() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLocale();

  return (
    <SettingsPage title={t("settings.languageLabel")}>
      <p className={kit.hint}>{t("settings.languageHint")}</p>
      <ChoiceList label={t("settings.languageLabel")} options={LANGUAGE_OPTIONS} value={language} onChange={setLanguage} />
    </SettingsPage>
  );
}
