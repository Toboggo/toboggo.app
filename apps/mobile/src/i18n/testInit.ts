/**
 * i18n — initialisation synchrone pour les tests (Vitest).
 *
 * `./index.ts` (utilisé par l'app réelle) charge les catalogues à la demande via
 * `lazyCatalogBackend` (import dynamique) et active `react.useSuspense`, ce qui
 * suppose un `<Suspense>` autour de l'arbre rendu — absent des tests d'écran
 * existants. Ici, les catalogues FR sont importés statiquement (résolution
 * synchrone) et `useSuspense` est désactivé : `useTranslation()` a un `t()`
 * fonctionnel dès le premier rendu, sans instance i18next à mettre en place
 * dans chaque fichier de test.
 *
 * Importer ce module (effet de bord) en tête de tout fichier de test qui rend
 * un écran utilisant `useTranslation` / `<Trans>`.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "./locales/fr/common.json";
import onboarding from "./locales/fr/onboarding.json";
import map from "./locales/fr/map.json";
import detail from "./locales/fr/detail.json";
import contribute from "./locales/fr/contribute.json";
import profile from "./locales/fr/profile.json";
import features from "./locales/fr/features.json";
import errors from "./locales/fr/errors.json";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: "fr",
    fallbackLng: "fr",
    defaultNS: "common",
    resources: {
      fr: { common, onboarding, map, detail, contribute, profile, features, errors },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  });
}

export default i18n;
