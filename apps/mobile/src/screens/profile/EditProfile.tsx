import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Input } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";

export default function EditProfile() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const profile = useSession((s) => s.profile);
  const patchProfile = useSession((s) => s.patchProfile);
  const showToast = useToastStore((s) => s.show);
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await patchProfile({ name, email });
      showToast(t("editProfile.updated"));
      navigate(-1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <TopBar title={t("editProfile.title")} />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <Input label={t("editProfile.name")} value={name} onChange={(e) => setName(e.target.value)} />
        <Input label={t("editProfile.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button block loading={saving} onClick={save}>
          {t("editProfile.save")}
        </Button>
      </div>
    </div>
  );
}
