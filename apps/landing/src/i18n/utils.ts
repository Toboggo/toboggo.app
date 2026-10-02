import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { fr } from "./translations/fr";
import { en } from "./translations/en";
import { es } from "./translations/es";
import type { Dictionary } from "./translations/types";

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en, es };

/**
 * Langue déduite du premier segment de l'URL (`/en/...` → "en"), sinon la
 * langue par défaut. Aucune route non-fr n'est publiée pour l'instant (voir
 * config.ts) mais la fonction est déjà correcte pour Website-7.
 */
export function getLangFromUrl(url: URL): Locale {
  const [, maybeLocale] = url.pathname.split("/");
  return maybeLocale && isLocale(maybeLocale) ? maybeLocale : DEFAULT_LOCALE;
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
