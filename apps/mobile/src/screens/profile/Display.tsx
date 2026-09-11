import { Toggle } from "@toboggo/design-system";
import { useTranslation } from "react-i18next";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";

export default function Display() {
  const profile = useSession((s) => s.profile);
  const patchProfile = useSession((s) => s.patchProfile);
  const { t } = useTranslation();

  return (
    <div className="screen">
      <TopBar title={t("settings.displayTitle")} />
      <div style={{ padding: "0 20px" }}>
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
