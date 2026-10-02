import { useTheme, type ThemePreference } from "@toboggo/design-system";
import { useTranslation } from "react-i18next";
import { ChoiceList, SettingsPage } from "./SettingsKit";

/**
 * Apparence — Système / Clair / Sombre. Remplace l'ancien Display.tsx (qui
 * mélangeait langue + apparence + mode hors-ligne, ce dernier retiré : voir
 * refonte profil/réglages, aucun consommateur réel de `offline_mode`).
 *
 * Entièrement local (useTheme, localStorage) : fonctionne en invité comme en
 * connecté, ne dépend pas du profil Supabase.
 */
export default function Appearance() {
  const { t } = useTranslation();
  const [, preference, setPreference] = useTheme();

  const options: { value: ThemePreference; label: string }[] = [
    { value: "system", label: t("settings.appearanceSystem") },
    { value: "light", label: t("settings.appearanceLight") },
    { value: "dark", label: t("settings.appearanceDark") },
  ];

  return (
    <SettingsPage title={t("settings.appearanceTitle")}>
      <ChoiceList label={t("settings.appearanceTitle")} options={options} value={preference} onChange={setPreference} />
    </SettingsPage>
  );
}
