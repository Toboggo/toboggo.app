import { useId } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { USERNAME_MAX, USERNAME_MIN } from "@toboggo/shared";
import { Button, Input } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { useUsernameForm } from "../../lib/useUsernameForm";

/** Modification du pseudo public — le seul champ de profil réellement éditable
 * (l'e-mail est celui du compte d'authentification, pas modifiable ici). */
export default function EditProfile() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const profile = useSession((s) => s.profile);
  const showToast = useToastStore((s) => s.show);
  const { value, onChange, error, saving, submit } = useUsernameForm(profile?.name ?? "");
  const formId = useId();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (await submit()) {
      showToast(t("username.saved"));
      navigate(-1);
    }
  }

  return (
    <div className="screen">
      <TopBar title={t("editProfile.title")} />
      <form id={formId} onSubmit={onSubmit} noValidate style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <Input
          label={t("username.label")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("username.placeholder")}
          help={`${t("username.help")} ${t("username.rules", { min: USERNAME_MIN, max: USERNAME_MAX })}`}
          error={error ?? undefined}
          autoComplete="nickname"
          autoCapitalize="words"
          autoCorrect="off"
          enterKeyHint="done"
          maxLength={USERNAME_MAX * 2}
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" block loading={saving}>
          {t("username.save")}
        </Button>
        <Button type="button" variant="ghost" block disabled={saving} onClick={() => navigate(-1)}>
          {t("username.cancel")}
        </Button>
      </form>
    </div>
  );
}
