import { SUPPORTED_LANGUAGES, type Language } from "./config";

/**
 * Noms de langue affichés dans leur propre langue — non traduits (endonymes).
 * Partagé entre l'écran Langue et la valeur secondaire affichée sur la ligne
 * "Langue" du Profil (§8 refonte profil/réglages — valeurs secondaires à droite).
 */
export const LANGUAGE_ENDONYM: Record<Language, string> = {
  fr: "Français",
  es: "Español",
  en: "English",
};

export const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((lng) => ({
  value: lng,
  label: LANGUAGE_ENDONYM[lng],
}));
