import { Segmented, Toggle } from "@toboggo/design-system";
import { useTranslation } from "react-i18next";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import { SUPPORTED_LANGUAGES, type Language } from "../../i18n/config";
import { useLocale } from "../../i18n/useLocale";

// Noms de langue affichés dans leur propre langue — non traduits (endonymes).
const LANGUAGE_ENDONYM: Record<Language, string> = {
  fr: "Français",
  es: "Español",
  en: "English",
};

export default function Display() {
  const profile = useSession((s) => s.profile);
  const patchProfile = useSession((s) => s.patchProfile);
  const { t } = useTranslation();
  const { language, setLanguage } = useLocale();

  return (
    <div className="screen">
      <TopBar title={t("settings.displayTitle")} />
      <div style={{ padding: "0 20px" }}>
        {/* Le choix de langue ne dépend pas d'un compte : disponible en mode invité. */}
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>
            {t("settings.languageLabel")}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "2px 0 10px" }}>
            {t("settings.languageHint")}
          </div>
          <Segmented
            options={SUPPORTED_LANGUAGES.map((lng) => ({ value: lng, label: LANGUAGE_ENDONYM[lng] }))}
            value={language}
            onChange={setLanguage}
          />
        </div>

        {profile && (
          <>
            <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
              <Toggle
                label={t("settings.offlineMode")}
                description={t("settings.offlineModeHint")}
                checked={profile.offline_mode}
                onChange={(v) => void patchProfile({ offline_mode: v })}
              />
            </div>
            <div style={{ padding: "14px 0" }}>
              <Toggle
                label={t("settings.darkMode")}
                checked={profile.dark_mode}
                onChange={(v) => void patchProfile({ dark_mode: v })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
