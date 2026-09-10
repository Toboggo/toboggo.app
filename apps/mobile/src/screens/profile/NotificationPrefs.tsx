import { useTranslation } from "react-i18next";
import { Toggle } from "@toboggo/design-system";
import type { Profile } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";

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
    <div className="screen">
      <TopBar title={t("notifs.title")} />
      <div style={{ padding: "0 20px" }}>
        {ITEMS.map((item) => (
          <div key={item.key} style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
            <Toggle
              label={t(item.labelKey)}
              checked={profile.notif_prefs[item.key]}
              onChange={(v) => void patchProfile({ notif_prefs: { ...profile.notif_prefs, [item.key]: v } })}
            />
          </div>
        ))}

        <div style={{ marginTop: 20, fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, color: "var(--color-text-faint)" }}>
          {t("notifs.channels")}
        </div>
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
          <Toggle
            label={t("notifs.channelPush")}
            checked={profile.notif_channels.push}
            onChange={(v) => void patchProfile({ notif_channels: { ...profile.notif_channels, push: v } })}
          />
        </div>
        <div style={{ padding: "14px 0" }}>
          <Toggle
            label={t("notifs.channelEmail")}
            checked={profile.notif_channels.email}
            onChange={(v) => void patchProfile({ notif_channels: { ...profile.notif_channels, email: v } })}
          />
        </div>
      </div>
    </div>
  );
}
