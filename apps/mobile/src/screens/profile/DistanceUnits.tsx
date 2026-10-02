import { useTranslation } from "react-i18next";
import { useDistanceUnit, type DistanceUnitPreference } from "../../lib/distanceUnit";
import { ChoiceList, SettingsPage, kit } from "./SettingsKit";

/**
 * Unités de distance — Automatique / Kilomètres / Miles. « Automatique » suit la
 * région de l'appareil (voir lib/distanceUnit.ts), pas la langue de l'app.
 * Local (localStorage) : fonctionne en invité comme en connecté.
 */
export default function DistanceUnits() {
  const { t } = useTranslation();
  const { preference, unit, setPreference } = useDistanceUnit();

  const effective = t(unit === "mi" ? "settings.distanceUnitMi" : "settings.distanceUnitKm").toLowerCase();
  const options: { value: DistanceUnitPreference; label: string; hint?: string }[] = [
    { value: "auto", label: t("settings.distanceUnitAuto"), hint: t("settings.distanceUnitAutoHint", { unit: effective }) },
    { value: "km", label: t("settings.distanceUnitKm") },
    { value: "mi", label: t("settings.distanceUnitMi") },
  ];

  return (
    <SettingsPage title={t("settings.distanceUnitsTitle")}>
      <p className={kit.hint}>{t("settings.distanceUnitsHint")}</p>
      <ChoiceList label={t("settings.distanceUnitsTitle")} options={options} value={preference} onChange={setPreference} />
    </SettingsPage>
  );
}
