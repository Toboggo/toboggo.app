import { Toggle } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";

export default function Display() {
  const profile = useSession((s) => s.profile);
  const patchProfile = useSession((s) => s.patchProfile);
  if (!profile) return null;

  return (
    <div className="screen">
      <TopBar title="Affichage" />
      <div style={{ padding: "0 20px" }}>
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
          <Toggle
            label="Mode hors-ligne"
            description="Carte enregistrée pour une utilisation sans connexion."
            checked={profile.offline_mode}
            onChange={(v) => void patchProfile({ offline_mode: v })}
          />
        </div>
        <div style={{ padding: "14px 0" }}>
          <Toggle label="Mode sombre" checked={profile.dark_mode} onChange={(v) => void patchProfile({ dark_mode: v })} />
        </div>
      </div>
    </div>
  );
}
