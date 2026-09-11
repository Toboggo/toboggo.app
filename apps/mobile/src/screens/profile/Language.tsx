import { Segmented } from "@toboggo/design-system";
import { useTranslation } from "react-i18next";
import { TopBar } from "../../components/TopBar";
import { LANGUAGE_OPTIONS } from "../../i18n/languageNames";
import { useLocale } from "../../i18n/useLocale";

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
    <div className="screen">
      <TopBar title={t("settings.languageLabel")} />
      <div style={{ padding: "0 20px" }}>
        <div style={{ padding: "14px 0" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "-4px 0 14px" }}>
            {t("settings.languageHint")}
          </div>
          <Segmented options={LANGUAGE_OPTIONS} value={language} onChange={setLanguage} />
        </div>
      </div>
    </div>
  );
}
