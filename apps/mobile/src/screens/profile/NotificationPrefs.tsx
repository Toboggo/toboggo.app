import { Toggle } from "@toboggo/design-system";
import type { Profile } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";

const ITEMS: { key: keyof Profile["notif_prefs"]; label: string }[] = [
  { key: "reports", label: "Suivi de mes signalements" },
  { key: "newParks", label: "Nouveaux parcs à proximité" },
  { key: "reviewReplies", label: "Réponses à mes avis" },
  { key: "recommendations", label: "Recommandations personnalisées" },
  { key: "news", label: "Actualités Toboggo" },
];

export default function NotificationPrefs() {
  const profile = useSession((s) => s.profile);
  const patchProfile = useSession((s) => s.patchProfile);
  if (!profile) return null;

  return (
    <div className="screen">
      <TopBar title="Notifications" />
      <div style={{ padding: "0 20px" }}>
        {ITEMS.map((item) => (
          <div key={item.key} style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
            <Toggle
              label={item.label}
              checked={profile.notif_prefs[item.key]}
              onChange={(v) => void patchProfile({ notif_prefs: { ...profile.notif_prefs, [item.key]: v } })}
            />
          </div>
        ))}

        <div style={{ marginTop: 20, fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, color: "var(--color-text-faint)" }}>
          Canaux
        </div>
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
          <Toggle
            label="Notifications push"
            checked={profile.notif_channels.push}
            onChange={(v) => void patchProfile({ notif_channels: { ...profile.notif_channels, push: v } })}
          />
        </div>
        <div style={{ padding: "14px 0" }}>
          <Toggle
            label="E-mail"
            checked={profile.notif_channels.email}
            onChange={(v) => void patchProfile({ notif_channels: { ...profile.notif_channels, email: v } })}
          />
        </div>
      </div>
    </div>
  );
}
