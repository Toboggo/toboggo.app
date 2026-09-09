/**
 * i18n — hook d'accès à la langue active et au changement de langue.
 *
 *   const { language, setLanguage, intlLocale } = useLocale();
 *
 * `setLanguage` : persiste le choix (`localStorage`) puis bascule i18next. À
 * partir de là, la langue du navigateur ne reprend plus jamais la main tant que
 * le choix n'est pas explicitement effacé. `intlLocale` est la balise BCP-47 à
 * donner aux `Intl.*` (voir `packages/shared/src/utils/format.ts`).
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { INTL_LOCALE, normalizeLanguage, type Language } from "./config";
import { persistLanguage } from "./detect";

export interface UseLocale {
  language: Language;
  setLanguage: (next: Language) => void;
  intlLocale: string;
}

export function useLocale(): UseLocale {
  const { i18n } = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

  const setLanguage = useCallback(
    (next: Language) => {
      if (next === language) return;
      persistLanguage(next);
      void i18n.changeLanguage(next);
    },
    [i18n, language],
  );

  return { language, setLanguage, intlLocale: INTL_LOCALE[language] };
}
