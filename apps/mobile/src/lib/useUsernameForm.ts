import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InvalidUsernameError, USERNAME_MAX, USERNAME_MIN, validateUsername } from "@toboggo/shared";
import { useSession } from "./session";

/**
 * État partagé des deux écrans de pseudo (choix initial + modification depuis
 * le profil). Valide côté client avec la règle unique de `@toboggo/shared`
 * (le serveur re-valide : migration 0041), traduit les erreurs, expose `saving`.
 */
export function useUsernameForm(initial: string) {
  const { t } = useTranslation("profile");
  const saveUsername = useSession((s) => s.saveUsername);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onChange = (next: string) => {
    setValue(next);
    if (error) setError(null);
  };

  /** Retourne `true` si le pseudo est enregistré. */
  async function submit(): Promise<boolean> {
    if (saving) return false;
    const check = validateUsername(value);
    if (!check.ok) {
      setError(t(`username.${check.issue}`, { min: USERNAME_MIN, max: USERNAME_MAX }));
      return false;
    }
    setSaving(true);
    try {
      await saveUsername(check.value);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof InvalidUsernameError ? t("username.invalidChars") : t("username.generic"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { value, onChange, error, saving, submit };
}
