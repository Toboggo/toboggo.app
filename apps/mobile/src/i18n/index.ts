/**
 * i18n — point d'initialisation. Importer `"./i18n"` une fois au démarrage
 * (`main.tsx`), avant le premier rendu React.
 *
 * - langue initiale : `detectInitialLanguage()` (choix manuel > navigateur > en) ;
 * - repli : `en`, namespace de repli : `common` ;
 * - namespaces chargés à la demande (`lazyCatalogBackend`) ;
 * - `document.documentElement.lang` suit la langue active d'i18next — jamais la
 *   géolocalisation ni le pays.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { lazyCatalogBackend } from "./backend";
import {
  DEFAULT_NAMESPACE,
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
} from "./config";
import { detectInitialLanguage } from "./detect";

const initialLanguage = detectInitialLanguage();

function syncHtmlLang(language: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalizeLanguage(language);
  }
}

void i18n
  .use(lazyCatalogBackend)
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    ns: [DEFAULT_NAMESPACE],
    defaultNS: DEFAULT_NAMESPACE,
    fallbackNS: DEFAULT_NAMESPACE,
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: true },
  });

syncHtmlLang(i18n.resolvedLanguage ?? initialLanguage);
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
