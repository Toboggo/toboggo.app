/**
 * Pseudo public (`profiles.name`) — règle unique, partagée client/serveur.
 *
 * Miroir exact de `profiles_name_guard` (supabase/migrations/0041) : après trim
 * et réduction des espaces internes, 3 à 24 caractères, sans caractère de
 * contrôle, sans « @ » (jamais d'e-mail en public), sans « < » ni « > ».
 * C'est un NOM AFFICHÉ, pas un identifiant : aucune unicité n'est exigée.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

export type UsernameIssue = "tooShort" | "tooLong" | "invalidChars";

export type UsernameCheck = { ok: true; value: string } | { ok: false; issue: UsernameIssue };

export function normalizeUsername(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function validateUsername(raw: string): UsernameCheck {
  const value = normalizeUsername(raw);
  const length = [...value].length;
  if (length < USERNAME_MIN) return { ok: false, issue: "tooShort" };
  if (length > USERNAME_MAX) return { ok: false, issue: "tooLong" };
  // eslint-disable-next-line no-control-regex -- contrôle volontaire des caractères de contrôle
  if (/[\u0000-\u001f\u007f-\u009f@<>]/.test(value)) return { ok: false, issue: "invalidChars" };
  return { ok: true, value };
}
