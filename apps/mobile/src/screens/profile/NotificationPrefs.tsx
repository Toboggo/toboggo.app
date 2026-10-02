import { useTranslation } from "react-i18next";
import { Toggle } from "@toboggo/design-system";
import type { Profile } from "@toboggo/shared";
import { useSession } from "../../lib/session";
import { SettingsPage, SettingsSection, kit } from "./SettingsKit";

const ITEMS: { key: keyof Profile["notif_prefs"]; labelKey: string }[] = [
  { key: "reports", labelKey: "notifs.pref.reports" },
  { key: "newParks", labelKey: "notifs.pref.newParks" },
  { key: "reviewReplies", labelKey: "notifs.pref.reviewReplies" },
  { key: "recommendations", labelKey: "notifs.pref.recommendations" },
  { key: "news", labelKey: "notifs.pref.news" },
];

export default function NotificationPrefs() {
  const { t } = useTranslation("profile");
  const profile = useSession((s) => s.profile);
  const patchProfile = useSession((s) => s.patchProfile);
  if (!profile) return null;

  return (
    <SettingsPage title={t("notifs.title")}>
      <SettingsSection>
        {ITEMS.map((item) => (
          <div key={item.key} className={kit.switchRow}>
            <Toggle
              label={t(item.labelKey)}
              checked={profile.notif_prefs[item.key]}
              onChange={(v) => void patchProfile({ notif_prefs: { ...profile.notif_prefs, [item.key]: v } })}
            />
          </div>
        ))}
      </SettingsSection>

      <SettingsSection title={t("notifs.channels")}>
        <div className={kit.switchRow}>
          <Toggle
            label={t("notifs.channelPush")}
            checked={profile.notif_channels.push}
            onChange={(v) => void patchProfile({ notif_channels: { ...profile.notif_channels, push: v } })}
          />
        </div>
        <div className={kit.switchRow}>
          <Toggle
            label={t("notifs.channelEmail")}
            checked={profile.notif_channels.email}
            onChange={(v) => void patchProfile({ notif_channels: { ...profile.notif_channels, email: v } })}
          />
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
